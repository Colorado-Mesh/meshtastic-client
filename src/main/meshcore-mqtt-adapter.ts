import { EventEmitter } from 'events';
import * as mqtt from 'mqtt';

import type { MQTTSettings, MQTTStatus } from '../renderer/lib/types';
import type { MeshcoreMqttChatEnvelopeV1 } from '../shared/meshcoreMqttEnvelope';
import { tryParseMeshcoreMqttChatEnvelope } from '../shared/meshcoreMqttEnvelope';
import { sanitizeLogMessage } from './log-service';

export type { MeshcoreMqttChatEnvelopeV1 } from '../shared/meshcoreMqttEnvelope';

function normalizePrefix(prefix: string): string {
  const p = (prefix || 'msh').trim();
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

function buildMeshcoreUrl(settings: MQTTSettings): string {
  const host = settings.server.trim();
  if (settings.useWebSocket) {
    const scheme = settings.port === 443 || settings.tlsInsecure !== true ? 'wss' : 'ws';
    return `${scheme}://${host}:${settings.port}/mqtt`;
  }
  return settings.port === 8883
    ? `mqtts://${host}:${settings.port}`
    : `mqtt://${host}:${settings.port}`;
}

export class MeshcoreMqttAdapter extends EventEmitter {
  private client: mqtt.MqttClient | null = null;
  private status: MQTTStatus = 'disconnected';
  private clientIdStr = '';
  private lastSettings: MQTTSettings | null = null;

  getStatus(): MQTTStatus {
    return this.status;
  }

  getClientId(): string {
    return this.clientIdStr;
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.removeAllListeners();
        this.client.end(true);
      } catch (e) {
        console.warn(
          '[MeshcoreMqttAdapter] disconnect',
          sanitizeLogMessage(e instanceof Error ? e.message : String(e)),
        );
      }
      this.client = null;
    }
    this.lastSettings = null;
    this.setStatus('disconnected');
  }

  connect(settings: MQTTSettings): void {
    this.disconnect();
    this.lastSettings = settings;
    const url = buildMeshcoreUrl(settings);
    const opts: mqtt.IClientOptions = {
      username: settings.username || undefined,
      password: settings.password || undefined,
      reconnectPeriod: 0,
      rejectUnauthorized: settings.tlsInsecure !== true,
    };
    this.setStatus('connecting');
    this.client = mqtt.connect(url, opts);
    this.client.on('connect', () => {
      this.clientIdStr = (this.client?.options.clientId as string) || '';
      const base = normalizePrefix(settings.topicPrefix || 'msh');
      const subTopic = `${base}/#`;
      this.client!.subscribe(subTopic, (err) => {
        if (err) {
          console.error('[MeshcoreMqttAdapter] subscribe failed', sanitizeLogMessage(err.message));
          this.setStatus('error');
          this.emit('error', `Subscribe failed: ${err.message}`);
          return;
        }
        this.setStatus('connected');
        this.emit('clientId', this.clientIdStr);
      });
    });
    this.client.on('message', (topic, payload) => {
      const buf = payload instanceof Buffer ? payload : Buffer.from(payload);
      let text = '';
      try {
        text = buf.toString('utf8');
      } catch {
        return;
      }
      const env = tryParseMeshcoreMqttChatEnvelope(text.trim());
      if (!env) return;
      this.emit('chatMessage', { topic, ...env });
    });
    this.client.on('error', (err) => {
      console.error(
        '[MeshcoreMqttAdapter] client error',
        sanitizeLogMessage(err instanceof Error ? err.message : String(err)),
      );
      this.emit('error', err instanceof Error ? err.message : String(err));
    });
    this.client.on('close', () => {
      if (this.status === 'connected' || this.status === 'connecting') {
        this.setStatus('disconnected');
      }
    });
  }

  private setStatus(s: MQTTStatus): void {
    this.status = s;
    this.emit('status', s);
  }

  publishChat(envelope: MeshcoreMqttChatEnvelopeV1): void {
    if (!this.client || this.status !== 'connected' || !this.lastSettings) {
      throw new Error('MeshCore MQTT not connected');
    }
    const base = normalizePrefix(this.lastSettings.topicPrefix || 'msh');
    const topic = `${base}/meshcore/chat`;
    const payload = JSON.stringify(envelope);
    this.client.publish(topic, payload, { qos: 0 });
  }
}
