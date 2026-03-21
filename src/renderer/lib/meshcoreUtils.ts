import type { MeshNode } from './types';

const MESHCORE_COORD_SCALE = 1e6;

/** Reserved range for channel / unknown-sender chat stubs (name-only, no pubkey). */
export const MESHCORE_CHAT_STUB_ID_MIN = 0xa0000000 >>> 0;
export const MESHCORE_CHAT_STUB_ID_MAX = 0xafffffff >>> 0;

const SYNTH_PLACEHOLDER_PUBKEY_MARKER_HEX = '4d434854'; // "MCHT"

/**
 * Stable pseudo node id for MeshCore channel traffic where only a display name is known.
 * Collisions with real pubkey-derived ids are unlikely but possible.
 */
export function meshcoreChatStubNodeIdFromDisplayName(name: string): number {
  const trimmed = (name || '').trim() || 'Unknown';
  let h = 2166136261 >>> 0;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (MESHCORE_CHAT_STUB_ID_MIN | (h & 0x0fffffff)) >>> 0;
}

export function meshcoreIsChatStubNodeId(nodeId: number): boolean {
  const u = nodeId >>> 0;
  return u >= MESHCORE_CHAT_STUB_ID_MIN && u <= MESHCORE_CHAT_STUB_ID_MAX;
}

/** MeshCore companion lines that are transport metadata, not user channel chat (splitting on `:` would mispick `SNR:`). */
export function isMeshcoreTransportStatusChatLine(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (/^\s*ack\s+@/iu.test(t)) return true;
  if (/^\s*nack\s+@/iu.test(t)) return true;
  return false;
}

/**
 * After `buildNodesFromContacts` replaces the node map, re-attach name-only RF/MQTT channel
 * stubs so they are not dropped. Skips stub ids that now exist on the device (real contact wins).
 */
export function mergeMeshcoreChatStubNodes(
  prev: Map<number, MeshNode>,
  deviceNodes: Map<number, MeshNode>,
): Map<number, MeshNode> {
  const next = new Map(deviceNodes);
  for (const [id, node] of prev) {
    if (meshcoreIsChatStubNodeId(id) && !deviceNodes.has(id)) {
      next.set(id, node);
    }
  }
  return next;
}

/** Placeholder pubkey stored until a real contact (0x8A) replaces the row. */
export function meshcoreSyntheticPlaceholderPubKeyHex(nodeId: number): string {
  const b = new Uint8Array(32);
  b[0] = 0x4d;
  b[1] = 0x43;
  b[2] = 0x48;
  b[3] = 0x54;
  new DataView(b.buffer).setUint32(4, nodeId >>> 0, false);
  for (let i = 8; i < 32; i++) {
    b[i] = (((nodeId >>> 0) + i) * 17) & 0xff;
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function meshcoreIsSyntheticPlaceholderPubKeyHex(hex: string): boolean {
  const h = hex.replace(/\s/g, '').toLowerCase();
  return h.length === 64 && h.startsWith(SYNTH_PLACEHOLDER_PUBKEY_MARKER_HEX);
}

export function minimalMeshcoreChatNode(
  nodeId: number,
  displayName: string,
  lastHeardSec: number,
  via: 'rf' | 'mqtt',
): MeshNode {
  const name = displayName.trim() || `Node-${nodeId.toString(16).toUpperCase()}`;
  return {
    node_id: nodeId,
    long_name: name,
    short_name: name.slice(0, 4),
    hw_model: 'Chat',
    snr: 0,
    battery: 0,
    last_heard: lastHeardSec,
    latitude: null,
    longitude: null,
    source: via,
    heard_via_mqtt_only: via === 'mqtt',
  };
}

/**
 * XOR-fold pubkey bytes into a stable unsigned 32-bit node ID.
 * Expects a 32-byte MeshCore public key; returns 0 for any other length.
 */
export function pubkeyToNodeId(key: Uint8Array): number {
  if (key.length !== 32) return 0;
  let result = 0;
  for (let i = 0; i < key.length; i += 4) {
    const word =
      key[i] | 0 | ((key[i + 1] | 0) << 8) | ((key[i + 2] | 0) << 16) | ((key[i + 3] | 0) << 24);
    result = (result ^ word) >>> 0;
  }
  return result >>> 0;
}

export const CONTACT_TYPE_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Chat',
  2: 'Repeater',
  3: 'Room',
};

interface MeshCoreContact {
  publicKey: Uint8Array;
  type: number;
  advName: string;
  lastAdvert: number;
  advLat: number;
  advLon: number;
}

export function meshcoreContactToMeshNode(contact: MeshCoreContact): MeshNode {
  const nodeId = pubkeyToNodeId(contact.publicKey);
  const lat = contact.advLat !== 0 ? contact.advLat / MESHCORE_COORD_SCALE : null;
  const lon = contact.advLon !== 0 ? contact.advLon / MESHCORE_COORD_SCALE : null;
  return {
    node_id: nodeId,
    long_name: contact.advName || `Node-${nodeId.toString(16).toUpperCase()}`,
    short_name: contact.advName?.slice(0, 4) || '????',
    hw_model: CONTACT_TYPE_LABELS[contact.type] ?? 'Unknown',
    snr: 0,
    battery: 0,
    last_heard: contact.lastAdvert,
    latitude: lat,
    longitude: lon,
  };
}
