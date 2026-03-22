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

/** For debug logs only — actual connect uses the same option-object shape as MQTTManager. */
function buildMeshcoreUrlForLog(settings: MQTTSettings): string {
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
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;
  /** True when the connect watchdog tore the client down — suppress noisy subscribe(err) after. */
  private connectAbortByWatchdog = false;

  getStatus(): MQTTStatus {
    return this.status;
  }

  getClientId(): string {
    return this.clientIdStr;
  }

  disconnect(): void {
    if (this.connectWatchdog) {
      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = null;
    }
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
    const clientId = `meshcore-mqtt-${Math.random().toString(36).slice(2, 10)}`;
    const useTls = settings.port === 8883;
    const rejectUnauthorizedTls = useTls ? !settings.tlsInsecure : false;
    const logUrl = buildMeshcoreUrlForLog(settings);

    // Match MQTTManager: WebSocket uses mqtt.connect({ protocol, host, port, path, … }) — not
    // mqtt.connect(urlString, opts), which can hang or mis-handle TLS in Node mqtt.js.
    let connectOpts: mqtt.IClientOptions = {
      clientId,
      username: settings.username || undefined,
      password: settings.password || undefined,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
      protocolVersion: 4,
    };
    if (settings.useWebSocket) {
      const wsScheme = settings.port === 443 || settings.tlsInsecure !== true ? 'wss' : 'ws';
      connectOpts = {
        ...connectOpts,
        protocol: wsScheme as 'wss' | 'ws',
        host: settings.server.trim(),
        port: settings.port,
        path: '/mqtt',
        rejectUnauthorized: settings.port === 443 ? true : rejectUnauthorizedTls,
        // Prefer IPv4 when DNS returns AAAA first but the path is broken (reduces WSS hangs).
        wsOptions: { family: 4 },
      };
    } else {
      connectOpts = {
        ...connectOpts,
        host: settings.server.trim(),
        port: settings.port,
        protocol: useTls ? 'mqtts' : 'mqtt',
        rejectUnauthorized: rejectUnauthorizedTls,
      };
    }

    console.debug(
      '[MeshcoreMqttAdapter] connect start',
      sanitizeLogMessage(logUrl),
      'ws:',
      settings.useWebSocket,
      'tlsInsecure:',
      settings.tlsInsecure === true,
    );
    this.setStatus('connecting');
    this.connectAbortByWatchdog = false;
    this.client = mqtt.connect(connectOpts);
    this.connectWatchdog = setTimeout(() => {
      this.connectWatchdog = null;
      if (this.status !== 'connecting' || !this.client) return;
      this.connectAbortByWatchdog = true;
      const msg =
        'MeshCore MQTT: connection timed out (no CONNACK/SUBACK within 10s). Check host, port, WebSocket path /mqtt, TLS, credentials, and topic prefix.';
      console.error('[MeshcoreMqttAdapter]', sanitizeLogMessage(msg));
      this.emit('error', msg);
      try {
        this.client.removeAllListeners();
        this.client.end(true);
      } catch {
        // catch-no-log-ok forced end during stuck connect
      }
      this.client = null;
      this.setStatus('disconnected');
    }, 10_000);
    const clearConnectWatchdog = () => {
      if (this.connectWatchdog) {
        clearTimeout(this.connectWatchdog);
        this.connectWatchdog = null;
      }
    };
    this.client.on('connect', () => {
      // Do not clear connectWatchdog here. mqtt.js emits `connect` after CONNACK; if subscribe
      // never completes (no SUBACK), we must still hit the 10s watchdog and unblock the UI.
      console.debug('[MeshcoreMqttAdapter] MQTT session established, subscribing…');
      this.clientIdStr = (this.client?.options.clientId as string) || '';
      const base = normalizePrefix(settings.topicPrefix || 'msh');
      const subTopic = `${base}/#`;
      this.client!.subscribe(subTopic, (err) => {
        clearConnectWatchdog();
        if (err) {
          if (this.connectAbortByWatchdog) {
            this.connectAbortByWatchdog = false;
            return;
          }
          console.error('[MeshcoreMqttAdapter] subscribe failed', sanitizeLogMessage(err.message));
          this.setStatus('error');
          this.emit('error', `Subscribe failed: ${err.message}`);
          return;
        }
        console.debug('[MeshcoreMqttAdapter] subscribed', sanitizeLogMessage(subTopic));
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
        // catch-no-log-ok invalid UTF-8 buffer — silently skip non-text MQTT payload
        return;
      }
      const env = tryParseMeshcoreMqttChatEnvelope(text.trim());
      if (!env) return;
      this.emit('chatMessage', { topic, ...env });
    });
    this.client.on('error', (err) => {
      clearConnectWatchdog();
      console.error(
        '[MeshcoreMqttAdapter] client error',
        sanitizeLogMessage(err instanceof Error ? err.message : String(err)),
      );
      this.emit('error', err instanceof Error ? err.message : String(err));
      // Unblock the UI immediately — 'close' may arrive many seconds later.
      if (this.status === 'connecting') {
        this.setStatus('disconnected');
      }
    });
    this.client.on('close', () => {
      clearConnectWatchdog();
      if (this.status === 'connected' || this.status === 'connecting') {
        this.setStatus('disconnected');
      }
    });
    this.client.on('offline', () => {
      console.warn('[MeshcoreMqttAdapter] client offline');
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
