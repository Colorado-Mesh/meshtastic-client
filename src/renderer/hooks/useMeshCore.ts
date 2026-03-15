import { SerialConnection, WebBleConnection, WebSerialConnection } from '@liamcottle/meshcore.js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { meshcoreContactToMeshNode, pubkeyToNodeId } from '../lib/meshcoreUtils';
import type { ChatMessage, DeviceState, MeshNode, TelemetryPoint } from '../lib/types';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SerialConnectionInstance extends InstanceType<typeof SerialConnection> {}

/** TCP connection implemented over IPC bridge (main-process net.Socket). */
class IpcTcpConnection {
  private host: string;
  private port: number;
  private inner: SerialConnectionInstance | null = null;
  private cleanupFns: (() => void)[] = [];

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  async connect() {
    // Create a subclass that wires write → IPC
    class TcpOverIpc extends (SerialConnection as unknown as new () => SerialConnectionInstance) {
      async write(bytes: Uint8Array) {
        await window.electronAPI.meshcore.tcp.write(Array.from(bytes));
      }
      async close() {
        await window.electronAPI.meshcore.tcp.disconnect();
      }
    }

    const instance = new TcpOverIpc() as unknown as SerialConnectionInstance;
    this.inner = instance;

    const offData = window.electronAPI.meshcore.tcp.onData((bytes) => {
      void instance.onDataReceived(new Uint8Array(bytes));
    });
    const offDisc = window.electronAPI.meshcore.tcp.onDisconnected(() => {
      instance.onDisconnected();
    });
    this.cleanupFns = [offData, offDisc];

    await window.electronAPI.meshcore.tcp.connect(this.host, this.port);
    await instance.onConnected();
  }

  get connection() {
    return this.inner;
  }

  cleanup() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
  }
}

export interface MeshCoreSelfInfo {
  name: string;
  publicKey: Uint8Array;
  type: number;
  txPower: number;
  radioFreq: number;
  batteryMilliVolts?: number;
}

export interface MeshCoreRepeaterStatus {
  battMilliVolts: number;
  noiseFloor: number;
  lastRssi: number;
  lastSnr: number;
  nPacketsRecv: number;
  nPacketsSent: number;
  totalAirTimeSecs: number;
  totalUpTimeSecs: number;
  nSentFlood: number;
  nSentDirect: number;
  nRecvFlood: number;
  nRecvDirect: number;
  errEvents: number;
  nDirectDups: number;
  nFloodDups: number;
  currTxQueueLen: number;
}

// The connection object returned by meshcore.js is typed loosely — use unknown and cast
interface MeshCoreConnection {
  on(event: string | number, cb: (...args: unknown[]) => void): void;
  off(event: string | number, cb: (...args: unknown[]) => void): void;
  once(event: string | number, cb: (...args: unknown[]) => void): void;
  emit(event: string | number, ...args: unknown[]): void;
  close(): Promise<void>;
  getSelfInfo(timeout?: number): Promise<MeshCoreSelfInfo>;
  getContacts(): Promise<MeshCoreContactRaw[]>;
  getChannels(): Promise<MeshCoreChannelRaw[]>;
  getWaitingMessages(): Promise<unknown[]>;
  sendFloodAdvert(): Promise<void>;
  sendTextMessage(
    pubKey: Uint8Array,
    text: string,
    type?: number,
  ): Promise<{ expectedAckCrc?: number; estTimeout?: number }>;
  sendChannelTextMessage(channelIdx: number, text: string): Promise<void>;
  removeContact(pubKey: Uint8Array): Promise<void>;
  setAdvertName(name: string): Promise<void>;
  reboot(): Promise<void>;
  getBatteryVoltage(): Promise<{ batteryMilliVolts: number }>;
  syncDeviceTime(): Promise<void>;
  tracePath(pubKeys: Uint8Array[]): Promise<{
    pathLen: number;
    pathHashes: number[];
    pathSnrs: number[];
    lastSnr: number;
    tag: number;
  }>;
  getStatus(pubKey: Uint8Array): Promise<{
    batt_milli_volts: number;
    curr_tx_queue_len: number;
    noise_floor: number;
    last_rssi: number;
    n_packets_recv: number;
    n_packets_sent: number;
    total_air_time_secs: number;
    total_up_time_secs: number;
    n_sent_flood: number;
    n_sent_direct: number;
    n_recv_flood: number;
    n_recv_direct: number;
    err_events: number;
    last_snr: number;
    n_direct_dups: number;
    n_flood_dups: number;
  }>;
}

interface MeshCoreContactRaw {
  publicKey: Uint8Array;
  type: number;
  advName: string;
  lastAdvert: number;
  advLat: number;
  advLon: number;
}

interface MeshCoreChannelRaw {
  channelIdx: number;
  name: string;
}

interface DeviceLogEntry {
  ts: number;
  level: string;
  source: string;
  message: string;
}

const INITIAL_STATE: DeviceState = {
  status: 'disconnected',
  myNodeNum: 0,
  connectionType: null,
};

const MAX_DEVICE_LOGS = 500;
const MAX_TELEMETRY_POINTS = 50;

export function useMeshCore() {
  const [state, setState] = useState<DeviceState>(INITIAL_STATE);
  const [nodes, setNodes] = useState<Map<number, MeshNode>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channels, setChannels] = useState<{ index: number; name: string }[]>([]);
  const [selfInfo, setSelfInfo] = useState<MeshCoreSelfInfo | null>(null);
  const [deviceLogs, setDeviceLogs] = useState<DeviceLogEntry[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [signalTelemetry, setSignalTelemetry] = useState<TelemetryPoint[]>([]);
  const [meshcoreTraceResults, setMeshcoreTraceResults] = useState<
    Map<number, { hops: { snr: number }[]; lastSnr: number }>
  >(new Map());
  const [meshcoreNodeStatus, setMeshcoreNodeStatus] = useState<Map<number, MeshCoreRepeaterStatus>>(
    new Map(),
  );

  const connRef = useRef<MeshCoreConnection | null>(null);
  const ipcTcpRef = useRef<IpcTcpConnection | null>(null);
  // Map pubKeyPrefix (6-byte hex) → nodeId for DM routing
  const pubKeyPrefixMapRef = useRef<Map<string, number>>(new Map());
  // Full pubKey → nodeId for sending
  const pubKeyMapRef = useRef<Map<number, Uint8Array>>(new Map());
  // Stable ref to current nodes so event listeners don't form stale closures
  const nodesRef = useRef<Map<number, MeshNode>>(new Map());
  // Pending ACK tracking: packetId → { nodeId, timeoutId }
  const pendingAcksRef = useRef<Map<number, { timeoutId: ReturnType<typeof setTimeout> }>>(
    new Map(),
  );

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Record a battery telemetry point whenever selfInfo battery data arrives/changes
  useEffect(() => {
    if (selfInfo?.batteryMilliVolts == null) return;
    const voltage = selfInfo.batteryMilliVolts / 1000;
    const point: TelemetryPoint = { timestamp: Date.now(), voltage };
    setTelemetry((prev) => [...prev, point].slice(-MAX_TELEMETRY_POINTS));
  }, [selfInfo?.batteryMilliVolts]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateNode = useCallback((node: MeshNode) => {
    setNodes((prev) => {
      const next = new Map(prev);
      next.set(node.node_id, node);
      return next;
    });
  }, []);

  const setupEventListeners = useCallback(
    (conn: MeshCoreConnection) => {
      // Push: periodic advert — event 0x80 = 128
      conn.on(128, (data: unknown) => {
        const d = data as {
          publicKey: Uint8Array;
          advLat: number;
          advLon: number;
          lastAdvert: number;
        };
        const nodeId = pubkeyToNodeId(d.publicKey);
        setNodes((prev) => {
          const existing = prev.get(nodeId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(nodeId, {
            ...existing,
            last_heard: d.lastAdvert,
            latitude: d.advLat !== 0 ? d.advLat / 1e7 : existing.latitude,
            longitude: d.advLon !== 0 ? d.advLon / 1e7 : existing.longitude,
          });
          return next;
        });
      });

      // Push: path updated — event 0x81 = 129; update last_heard for that contact
      conn.on(129, (data: unknown) => {
        const d = data as { publicKey: Uint8Array };
        const nodeId = pubkeyToNodeId(d.publicKey);
        setNodes((prev) => {
          const existing = prev.get(nodeId);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(nodeId, { ...existing, last_heard: Math.floor(Date.now() / 1000) });
          return next;
        });
      });

      // Push: send confirmed — event 0x82 = 130; resolve pending DM delivery
      conn.on(130, (data: unknown) => {
        const d = data as { ackCode: number; roundTrip?: number };
        const pending = pendingAcksRef.current.get(d.ackCode);
        if (!pending) return;
        clearTimeout(pending.timeoutId);
        pendingAcksRef.current.delete(d.ackCode);
        setMessages((prev) =>
          prev.map((m) => (m.packetId === d.ackCode ? { ...m, status: 'acked' as const } : m)),
        );
      });

      // Push: new contact discovered — event 0x8A = 138
      conn.on(138, (data: unknown) => {
        const d = data as MeshCoreContactRaw;
        const node = meshcoreContactToMeshNode(d);
        pubKeyMapRef.current.set(node.node_id, d.publicKey);
        const prefix = Array.from(d.publicKey.slice(0, 6))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        pubKeyPrefixMapRef.current.set(prefix, node.node_id);
        updateNode(node);
      });

      // Push: message waiting — event 0x83 = 131; fetch all queued messages
      conn.on(131, () => {
        void (async () => {
          try {
            const msgs = await conn.getWaitingMessages();
            for (const m of msgs as {
              contactMessage?: { pubKeyPrefix: Uint8Array; senderTimestamp: number; text: string };
              channelMessage?: { channelIdx: number; senderTimestamp: number; text: string };
            }[]) {
              if (m.contactMessage) {
                const d = m.contactMessage;
                const prefix = Array.from(d.pubKeyPrefix)
                  .map((b) => b.toString(16).padStart(2, '0'))
                  .join('');
                const senderId = pubKeyPrefixMapRef.current.get(prefix) ?? 0;
                const sender = nodesRef.current.get(senderId);
                if (senderId !== 0) {
                  setNodes((prev) => {
                    const node = prev.get(senderId);
                    if (!node) return prev;
                    const next = new Map(prev);
                    next.set(senderId, { ...node, last_heard: d.senderTimestamp });
                    return next;
                  });
                }
                addMessage({
                  sender_id: senderId,
                  sender_name: sender?.long_name ?? `Node-${senderId.toString(16).toUpperCase()}`,
                  payload: d.text,
                  channel: -1,
                  timestamp: d.senderTimestamp * 1000,
                  status: 'acked',
                  isHistory: true,
                });
              }
              if (m.channelMessage) {
                const d = m.channelMessage;
                addMessage({
                  sender_id: 0,
                  sender_name: 'Unknown',
                  payload: d.text,
                  channel: d.channelIdx,
                  timestamp: d.senderTimestamp * 1000,
                  status: 'acked',
                  isHistory: true,
                });
              }
            }
          } catch (e) {
            console.warn('[useMeshCore] getWaitingMessages error', e);
          }
        })();
      });

      // Incoming DM — event 7
      conn.on(7, (data: unknown) => {
        const d = data as { pubKeyPrefix: Uint8Array; text: string; senderTimestamp: number };
        const prefix = Array.from(d.pubKeyPrefix)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const senderId = pubKeyPrefixMapRef.current.get(prefix) ?? 0;
        const sender = nodesRef.current.get(senderId);
        if (senderId !== 0) {
          setNodes((prev) => {
            const node = prev.get(senderId);
            if (!node) return prev;
            const next = new Map(prev);
            next.set(senderId, { ...node, last_heard: d.senderTimestamp });
            return next;
          });
        }
        addMessage({
          sender_id: senderId,
          sender_name: sender?.long_name ?? `Node-${senderId.toString(16).toUpperCase()}`,
          payload: d.text,
          channel: -1, // DM channel sentinel
          timestamp: d.senderTimestamp * 1000,
          status: 'acked',
        });
      });

      // Incoming channel message — event 8
      conn.on(8, (data: unknown) => {
        const d = data as { channelIdx: number; text: string; senderTimestamp: number };
        addMessage({
          sender_id: 0, // unknown sender in channel mode
          sender_name: 'Unknown',
          payload: d.text,
          channel: d.channelIdx,
          timestamp: d.senderTimestamp * 1000,
          status: 'acked',
        });
      });

      // Push: RF packet received — event 0x88 = 136; feed into device logs + signal telemetry
      conn.on(136, (data: unknown) => {
        const d = data as { lastSnr?: number; lastRssi?: number; raw?: unknown };
        const snr = d.lastSnr ?? 0;
        const rssi = d.lastRssi ?? 0;
        const now = Date.now();
        const entry: DeviceLogEntry = {
          ts: now,
          level: 'info',
          source: 'device',
          message: `RX SNR=${snr.toFixed(2)}dB RSSI=${rssi}dBm`,
        };
        setDeviceLogs((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_DEVICE_LOGS ? next.slice(next.length - MAX_DEVICE_LOGS) : next;
        });
        const sigPoint: TelemetryPoint = { timestamp: now, snr, rssi };
        setSignalTelemetry((prev) => [...prev, sigPoint].slice(-MAX_TELEMETRY_POINTS));
      });

      conn.on('disconnected', () => {
        setState((prev) => ({ ...prev, status: 'disconnected' }));
      });
    },
    [addMessage, updateNode],
  );

  const connect = useCallback(
    async (type: 'ble' | 'serial' | 'tcp', tcpHost?: string) => {
      setState({
        status: 'connecting',
        myNodeNum: 0,
        connectionType: type === 'tcp' ? 'http' : type,
      });

      try {
        let conn: MeshCoreConnection;

        if (type === 'ble') {
          conn = (await (
            WebBleConnection as unknown as { open(): Promise<unknown> }
          ).open()) as MeshCoreConnection;
        } else if (type === 'serial') {
          conn = (await (
            WebSerialConnection as unknown as { open(): Promise<unknown> }
          ).open()) as MeshCoreConnection;
        } else {
          // tcp
          const host = tcpHost ?? 'localhost';
          const tcpConn = new IpcTcpConnection(host, 4403);
          ipcTcpRef.current = tcpConn;
          await tcpConn.connect();
          conn = tcpConn.connection as unknown as MeshCoreConnection;
        }

        connRef.current = conn;
        setupEventListeners(conn);

        setState((prev) => ({ ...prev, status: 'connected' }));

        // Fetch self info, contacts, channels (sequential — device handles one request at a time)
        const info = await conn.getSelfInfo(5000);
        setSelfInfo(info);

        const myNodeId = pubkeyToNodeId(info.publicKey);
        setState((prev) => ({ ...prev, myNodeNum: myNodeId, status: 'configured' }));

        const contacts = await conn.getContacts();
        const newNodes = new Map<number, MeshNode>();
        for (const contact of contacts) {
          const node = meshcoreContactToMeshNode(contact);
          newNodes.set(node.node_id, node);
          pubKeyMapRef.current.set(node.node_id, contact.publicKey);
          const prefix = Array.from(contact.publicKey.slice(0, 6))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
          pubKeyPrefixMapRef.current.set(prefix, node.node_id);
        }
        setNodes(newNodes);

        const rawChannels = await conn.getChannels();
        setChannels(rawChannels.map((c) => ({ index: c.channelIdx, name: c.name })));

        // Post-init side-effects — fire-and-forget after full handshake to avoid request conflicts
        void conn.syncDeviceTime().catch((e) => {
          console.warn('[useMeshCore] syncDeviceTime error', e);
        });
        void conn
          .getBatteryVoltage()
          .then(({ batteryMilliVolts }) => {
            setSelfInfo((prev) => (prev ? { ...prev, batteryMilliVolts } : prev));
          })
          .catch((e) => {
            console.warn('[useMeshCore] getBatteryVoltage error', e);
          });
      } catch (err) {
        console.error('[useMeshCore] connect error', err);
        setState({ status: 'disconnected', myNodeNum: 0, connectionType: null });
        ipcTcpRef.current?.cleanup();
        ipcTcpRef.current = null;
      }
    },
    [setupEventListeners],
  );

  const disconnect = useCallback(async () => {
    // Cancel all pending ACK timers
    for (const { timeoutId } of pendingAcksRef.current.values()) {
      clearTimeout(timeoutId);
    }
    pendingAcksRef.current.clear();

    try {
      await connRef.current?.close();
    } catch {
      // ignore
    }
    ipcTcpRef.current?.cleanup();
    ipcTcpRef.current = null;
    connRef.current = null;
    pubKeyMapRef.current.clear();
    pubKeyPrefixMapRef.current.clear();
    setNodes(new Map());
    setMessages([]);
    setChannels([]);
    setSelfInfo(null);
    setDeviceLogs([]);
    setTelemetry([]);
    setSignalTelemetry([]);
    setMeshcoreTraceResults(new Map());
    setMeshcoreNodeStatus(new Map());
    setState(INITIAL_STATE);
  }, []);

  const sendMessage = useCallback(
    async (text: string, channelIdx: number, destNodeId?: number) => {
      if (!connRef.current) return;
      if (destNodeId !== undefined) {
        const pubKey = pubKeyMapRef.current.get(destNodeId);
        if (!pubKey) {
          console.warn('[useMeshCore] sendMessage: no pubKey for', destNodeId);
          return;
        }
        const sentAt = Date.now();
        // Optimistically add own message with 'sending' status
        const tempMsg: ChatMessage = {
          sender_id: 0, // placeholder, replaced after we get the ackCrc
          sender_name: selfInfo?.name ?? 'Me',
          payload: text,
          channel: channelIdx,
          timestamp: sentAt,
          status: 'sending',
          to: destNodeId,
        };
        setMessages((prev) => [...prev, tempMsg]);

        try {
          const result = await connRef.current.sendTextMessage(pubKey, text);
          const ackCrc = result?.expectedAckCrc;
          const estTimeout = result?.estTimeout ?? 30_000;

          if (ackCrc !== undefined) {
            // Update the temp message with the real packetId
            setMessages((prev) =>
              prev.map((m) =>
                m === tempMsg || (m.timestamp === sentAt && m.status === 'sending')
                  ? { ...m, sender_id: 0, packetId: ackCrc }
                  : m,
              ),
            );

            // Schedule failure timeout
            const timeoutId = setTimeout(() => {
              pendingAcksRef.current.delete(ackCrc);
              setMessages((prev) =>
                prev.map((m) =>
                  m.packetId === ackCrc && m.status === 'sending'
                    ? { ...m, status: 'failed' as const }
                    : m,
                ),
              );
            }, estTimeout);
            pendingAcksRef.current.set(ackCrc, { timeoutId });
          } else {
            // No ackCrc — mark as acked immediately
            setMessages((prev) =>
              prev.map((m) =>
                m === tempMsg || (m.timestamp === sentAt && m.status === 'sending')
                  ? { ...m, sender_id: 0, status: 'acked' as const }
                  : m,
              ),
            );
          }
        } catch (e) {
          console.warn('[useMeshCore] sendTextMessage error', e);
          setMessages((prev) =>
            prev.map((m) =>
              m === tempMsg || (m.timestamp === sentAt && m.status === 'sending')
                ? { ...m, status: 'failed' as const }
                : m,
            ),
          );
        }
      } else {
        await connRef.current.sendChannelTextMessage(channelIdx, text);
        // Channel messages resolve with Ok — add as acked immediately
        addMessage({
          sender_id: 0,
          sender_name: selfInfo?.name ?? 'Me',
          payload: text,
          channel: channelIdx,
          timestamp: Date.now(),
          status: 'acked',
        });
      }
    },
    [addMessage, selfInfo],
  );

  const refreshContacts = useCallback(async () => {
    if (!connRef.current) return;
    const contacts = await connRef.current.getContacts();
    const newNodes = new Map<number, MeshNode>();
    pubKeyMapRef.current.clear();
    pubKeyPrefixMapRef.current.clear();
    for (const contact of contacts) {
      const node = meshcoreContactToMeshNode(contact);
      newNodes.set(node.node_id, node);
      pubKeyMapRef.current.set(node.node_id, contact.publicKey);
      const prefix = Array.from(contact.publicKey.slice(0, 6))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      pubKeyPrefixMapRef.current.set(prefix, node.node_id);
    }
    setNodes(newNodes);
  }, []);

  const sendAdvert = useCallback(async () => {
    if (!connRef.current) return;
    await connRef.current.sendFloodAdvert();
  }, []);

  const reboot = useCallback(async () => {
    if (!connRef.current) return;
    try {
      await connRef.current.reboot();
    } catch (e) {
      console.warn('[useMeshCore] reboot error', e);
    }
    await disconnect();
  }, [disconnect]);

  const deleteNode = useCallback(async (nodeId: number) => {
    const pubKey = pubKeyMapRef.current.get(nodeId);
    if (!pubKey || !connRef.current) return;
    await connRef.current.removeContact(pubKey);
    pubKeyMapRef.current.delete(nodeId);
    // Remove the 6-byte prefix mapping too
    for (const [prefix, id] of pubKeyPrefixMapRef.current) {
      if (id === nodeId) {
        pubKeyPrefixMapRef.current.delete(prefix);
        break;
      }
    }
    setNodes((prev) => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const setOwner = useCallback(async (name: string) => {
    if (!connRef.current) return;
    await connRef.current.setAdvertName(name);
    setSelfInfo((prev) => (prev ? { ...prev, name } : prev));
  }, []);

  const traceRoute = useCallback(async (nodeId: number) => {
    const pubKey = pubKeyMapRef.current.get(nodeId);
    if (!pubKey || !connRef.current) return;
    const result = await connRef.current.tracePath([pubKey]);
    // pathSnrs are signed bytes in 0.25dB units
    const hops = result.pathSnrs.map((raw) => {
      const signed = raw > 127 ? raw - 256 : raw;
      return { snr: signed * 0.25 };
    });
    setMeshcoreTraceResults((prev) => {
      const next = new Map(prev);
      next.set(nodeId, { hops, lastSnr: result.lastSnr * 0.25 });
      return next;
    });
  }, []);

  const requestRepeaterStatus = useCallback(async (nodeId: number) => {
    const pubKey = pubKeyMapRef.current.get(nodeId);
    if (!pubKey || !connRef.current) return;
    const raw = await connRef.current.getStatus(pubKey);
    const status: MeshCoreRepeaterStatus = {
      battMilliVolts: raw.batt_milli_volts,
      noiseFloor: raw.noise_floor,
      lastRssi: raw.last_rssi,
      lastSnr: raw.last_snr,
      nPacketsRecv: raw.n_packets_recv,
      nPacketsSent: raw.n_packets_sent,
      totalAirTimeSecs: raw.total_air_time_secs,
      totalUpTimeSecs: raw.total_up_time_secs,
      nSentFlood: raw.n_sent_flood,
      nSentDirect: raw.n_sent_direct,
      nRecvFlood: raw.n_recv_flood,
      nRecvDirect: raw.n_recv_direct,
      errEvents: raw.err_events,
      nDirectDups: raw.n_direct_dups,
      nFloodDups: raw.n_flood_dups,
      currTxQueueLen: raw.curr_tx_queue_len,
    };
    setMeshcoreNodeStatus((prev) => {
      const next = new Map(prev);
      next.set(nodeId, status);
      return next;
    });
  }, []);

  // No-op stubs to satisfy the same interface shape used in App.tsx
  const noopAsync = useCallback(async () => {}, []);
  const noopVoid = useCallback(() => {}, []);

  return {
    state,
    nodes,
    messages,
    channels,
    selfInfo,
    connect,
    disconnect,
    sendMessage,
    sendAdvert,
    refreshContacts,
    reboot,
    deleteNode,
    setOwner,
    traceRoute,
    requestRepeaterStatus,
    deviceLogs,
    meshcoreTraceResults,
    meshcoreNodeStatus,
    // Stubs for interface compatibility
    mqttStatus: 'disconnected' as const,
    selfNodeId: state.myNodeNum,
    getNodes: useCallback(() => Array.from(nodes.values()), [nodes]),
    getFullNodeLabel: useCallback(
      (id: number) => nodes.get(id)?.long_name ?? id.toString(16).toUpperCase(),
      [nodes],
    ),
    getPickerStyleNodeLabel: useCallback(
      (id: number) => nodes.get(id)?.long_name ?? id.toString(16).toUpperCase(),
      [nodes],
    ),
    traceRouteResults: new Map<number, { route: number[]; from: number }>(),
    queueStatus: null,
    neighborInfo: new Map<number, unknown>(),
    waypoints: [] as unknown[],
    telemetry,
    signalTelemetry,
    environmentTelemetry: [] as unknown[],
    channelConfigs: [] as unknown[],
    moduleConfigs: {} as Record<string, unknown>,
    deviceOwner: null,
    ourPosition: null,
    gpsLoading: false,
    telemetryEnabled: null,
    sendReaction: noopAsync,
    requestPosition: noopAsync,
    setNodeFavorited: noopAsync,
    shutdown: noopAsync,
    factoryReset: noopAsync,
    resetNodeDb: noopAsync,
    commitConfig: noopAsync,
    setConfig: noopAsync,
    setDeviceChannel: noopAsync,
    clearChannel: noopAsync,
    rebootOta: noopAsync,
    enterDfuMode: noopAsync,
    factoryResetConfig: noopAsync,
    sendWaypoint: noopAsync,
    deleteWaypoint: noopAsync,
    setModuleConfig: noopAsync,
    setCannedMessages: noopAsync,
    requestRefresh: noopAsync,
    refreshOurPosition: noopAsync,
    sendPositionToDevice: noopAsync,
    updateGpsInterval: noopVoid,
    refreshNodesFromDb: noopAsync,
    refreshMessagesFromDb: noopAsync,
    connectAutomatic: noopAsync,
    telemetryDeviceUpdateInterval: undefined as number | undefined,
  };
}
