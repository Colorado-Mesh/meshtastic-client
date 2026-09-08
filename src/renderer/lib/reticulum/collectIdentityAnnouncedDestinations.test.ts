import { describe, expect, it } from 'vitest';

import type { ReticulumIdentityActivityRow } from '@/renderer/stores/reticulumIdentityActivityStore';

import { collectIdentityAnnouncedDestinations } from './collectIdentityAnnouncedDestinations';

const ID = '11111111111111111111111111111111';
const CHAT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const VOICE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOMAD = 'cccccccccccccccccccccccccccccccc';

function row(
  destination_hash: string,
  aspect: string,
  last_seen: number,
  identity_hash: string | null = ID,
): ReticulumIdentityActivityRow {
  return { destination_hash, aspect, identity_hash, last_seen };
}

describe('collectIdentityAnnouncedDestinations', () => {
  it('lists all aspects for an identity with opened first', () => {
    const byDestination = new Map<string, ReticulumIdentityActivityRow[]>([
      [CHAT, [row(CHAT, 'lxmf.delivery', 100)]],
      [VOICE, [row(VOICE, 'lxst.telephony', 200)]],
      [NOMAD, [row(NOMAD, 'nomadnetwork.node', 150)]],
    ]);
    const rows = collectIdentityAnnouncedDestinations(CHAT, ID, byDestination);
    expect(rows.map((r) => r.aspect)).toEqual([
      'lxmf.delivery',
      'lxst.telephony',
      'nomadnetwork.node',
    ]);
    expect(rows[0]?.isOpened).toBe(true);
    expect(rows[1]?.destination_hash).toBe(VOICE);
  });

  it('falls back to opened destination when identity is unknown', () => {
    const byDestination = new Map<string, ReticulumIdentityActivityRow[]>([
      [CHAT, [row(CHAT, 'lxmf.delivery', 10, null)]],
    ]);
    const rows = collectIdentityAnnouncedDestinations(CHAT, null, byDestination);
    expect(rows).toEqual([
      {
        destination_hash: CHAT,
        aspect: 'lxmf.delivery',
        last_seen: 10,
        isOpened: true,
      },
    ]);
  });

  it('includes opened hash when identity siblings omit it', () => {
    const byDestination = new Map<string, ReticulumIdentityActivityRow[]>([
      [VOICE, [row(VOICE, 'lxst.telephony', 50)]],
      [CHAT, [row(CHAT, 'lxmf.delivery', 40, null)]],
    ]);
    const rows = collectIdentityAnnouncedDestinations(CHAT, ID, byDestination);
    expect(rows.some((r) => r.destination_hash === CHAT && r.isOpened)).toBe(true);
    expect(rows.some((r) => r.destination_hash === VOICE)).toBe(true);
  });

  it('returns no rows for invalid opened hash or non-empty invalid identity', () => {
    const byDestination = new Map<string, ReticulumIdentityActivityRow[]>([
      [CHAT, [row(CHAT, 'lxmf.delivery', 10)]],
    ]);
    expect(collectIdentityAnnouncedDestinations('not-a-hash', null, byDestination)).toEqual([]);
    expect(
      collectIdentityAnnouncedDestinations(
        'aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99',
        null,
        byDestination,
      ),
    ).toEqual([]);
    expect(collectIdentityAnnouncedDestinations(CHAT, 'deadbeef', byDestination)).toEqual([]);
    expect(
      collectIdentityAnnouncedDestinations(
        CHAT,
        '11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11',
        byDestination,
      ),
    ).toEqual([]);
  });

  it('skips rows whose destination hash is not strict 32-hex', () => {
    const byDestination = new Map<string, ReticulumIdentityActivityRow[]>([
      [
        CHAT,
        [
          row(CHAT, 'lxmf.delivery', 10),
          row('aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99', 'lxst.telephony', 20),
          row('prefix' + CHAT, 'nomadnetwork.node', 30),
        ],
      ],
    ]);
    const rows = collectIdentityAnnouncedDestinations(CHAT, null, byDestination);
    expect(rows).toEqual([
      {
        destination_hash: CHAT,
        aspect: 'lxmf.delivery',
        last_seen: 10,
        isOpened: true,
      },
    ]);
  });
});
