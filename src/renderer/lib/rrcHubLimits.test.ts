import { describe, expect, it } from 'vitest';

import {
  computeRrcByteLimitStatus,
  isRrcHubMsgBodyLimitError,
  isRrcHubNickLimitError,
  parseRrcHubLimits,
  rrcComposerBypassesSplit,
} from './rrcHubLimits';

describe('parseRrcHubLimits', () => {
  it('normalizes positive integers and drops invalid values', () => {
    expect(
      parseRrcHubLimits({
        max_msg_body_bytes: 350,
        max_nick_bytes: 32.9,
        max_room_name_bytes: 0,
        max_rooms_per_session: -1,
        rate_limit_msgs_per_minute: 'nope',
      }),
    ).toEqual({
      max_msg_body_bytes: 350,
      max_nick_bytes: 32,
      max_room_name_bytes: null,
      max_rooms_per_session: null,
      rate_limit_msgs_per_minute: null,
    });
  });
});

describe('computeRrcByteLimitStatus', () => {
  it('returns null when the hub did not advertise a limit', () => {
    expect(computeRrcByteLimitStatus('hello', null)).toBeNull();
  });

  it('stays ok below 80% and warns at the threshold', () => {
    expect(computeRrcByteLimitStatus('a'.repeat(279), 350)?.phase).toBe('ok');
    expect(computeRrcByteLimitStatus('a'.repeat(280), 350)?.phase).toBe('warn');
  });

  it('counts UTF-8 wire bytes for emoji', () => {
    // 🦊 is 4 UTF-8 bytes
    const status = computeRrcByteLimitStatus('🦊'.repeat(88), 350);
    expect(status?.byteCount).toBe(352);
    expect(status?.phase).toBe('overMax');
  });
});

describe('rrcComposerBypassesSplit', () => {
  it('bypasses slash commands but not plain chat', () => {
    expect(rrcComposerBypassesSplit('hello')).toBe(false);
    expect(rrcComposerBypassesSplit('/help')).toBe(true);
    expect(rrcComposerBypassesSplit('/me waves')).toBe(true);
    expect(rrcComposerBypassesSplit('/join lobby')).toBe(true);
  });
});

describe('hub limit error detectors', () => {
  it('matches sidecar hub limit error strings', () => {
    expect(isRrcHubMsgBodyLimitError('message exceeds hub limit (350 bytes)')).toBe(true);
    expect(isRrcHubNickLimitError('nickname exceeds hub limit (32 bytes)')).toBe(true);
    expect(isRrcHubMsgBodyLimitError('send failed')).toBe(false);
  });
});
