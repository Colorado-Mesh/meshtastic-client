/** Helpers for RRC WELCOME hub byte limits (nick / room name / message body). */

import { countMessageWireBytes } from '@/renderer/lib/chatComposerLimits';
import { parseRrcSlashInput } from '@/renderer/lib/rrcSlashCommands';
import type { RrcHubLimits } from '@/shared/rrc-types';

export type RrcByteLimitPhase = 'ok' | 'warn' | 'overMax';

export interface RrcByteLimitStatus {
  byteCount: number;
  limit: number;
  phase: RrcByteLimitPhase;
  showThreshold: number;
}

/** Normalize optional hub limit integers (reject non-positive). */
export function normalizeRrcHubByteLimit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n > 0 ? n : null;
}

export function parseRrcHubLimits(raw: unknown): RrcHubLimits {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  return {
    max_nick_bytes: normalizeRrcHubByteLimit(o.max_nick_bytes),
    max_room_name_bytes: normalizeRrcHubByteLimit(o.max_room_name_bytes),
    max_msg_body_bytes: normalizeRrcHubByteLimit(o.max_msg_body_bytes),
    max_rooms_per_session: normalizeRrcHubByteLimit(o.max_rooms_per_session),
    rate_limit_msgs_per_minute: normalizeRrcHubByteLimit(o.rate_limit_msgs_per_minute),
  };
}

/**
 * UTF-8 byte counter status for nick / room-name / body fields.
 * Counter hidden until ≥80% of the hub limit (same pattern as ChatComposer).
 */
export function computeRrcByteLimitStatus(
  text: string,
  limit: number | null | undefined,
): RrcByteLimitStatus | null {
  const max = normalizeRrcHubByteLimit(limit ?? null);
  if (max == null) return null;
  const byteCount = countMessageWireBytes(text);
  const showThreshold = Math.floor(max * 0.8);
  let phase: RrcByteLimitPhase = 'ok';
  if (byteCount > max) phase = 'overMax';
  else if (byteCount >= showThreshold) phase = 'warn';
  return { byteCount, limit: max, phase, showThreshold };
}

/**
 * Slash drafts (local/hub commands) bypass ChatComposer multi-part split so
 * `/join` / `/help` / `/nick` are never turned into `[1/N]` room spam.
 */
export function rrcComposerBypassesSplit(raw: string): boolean {
  const text = raw.trim();
  if (!text.startsWith('/')) return false;
  const parsed = parseRrcSlashInput(text);
  return parsed != null && parsed.kind !== 'chat';
}

/** True when sidecar/hub rejected a body for exceeding WELCOME max_msg_body_bytes. */
export function isRrcHubMsgBodyLimitError(message: string): boolean {
  return /message exceeds hub limit/i.test(message);
}

/** True when sidecar/hub rejected a nickname for exceeding WELCOME max_nick_bytes. */
export function isRrcHubNickLimitError(message: string): boolean {
  return /nickname exceeds hub limit/i.test(message);
}
