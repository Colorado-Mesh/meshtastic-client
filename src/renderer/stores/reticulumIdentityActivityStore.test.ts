import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  parseAnnounceActivityRows,
  resetReticulumIdentityActivityBatchForTests,
  setReticulumAnnounceBusPressureActive,
  useReticulumIdentityActivityStore,
} from './reticulumIdentityActivityStore';

describe('parseAnnounceActivityRows', () => {
  it('parses single aspect announce payload', () => {
    const rows = parseAnnounceActivityRows({
      destination_hash: 'abc123',
      aspect: 'lxmf.delivery',
      identity_hash: 'id99',
      hops: 2,
      last_seen: 1700,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      destination_hash: 'abc123',
      aspect: 'lxmf.delivery',
      identity_hash: 'id99',
      hops: 2,
      last_seen: 1700,
    });
  });

  it('expands aspects array', () => {
    const rows = parseAnnounceActivityRows({
      destination_hash: 'peer1',
      aspects: ['nomadnetwork.node', 'lxmf.delivery'],
    });
    expect(rows.map((r) => r.aspect)).toEqual(['nomadnetwork.node', 'lxmf.delivery']);
  });

  it('returns no rows when aspect is missing (does not invent unknown)', () => {
    const rows = parseAnnounceActivityRows({
      destination_hash: 'peer1',
      hops: 3,
      identity_hash: 'id_a',
    });
    expect(rows).toEqual([]);
  });

  it('parses batched announces and skips aspect-less entries', () => {
    const rows = parseAnnounceActivityRows({
      announces: [
        { destination_hash: 'aaa', hops: 1 },
        {
          destination_hash: 'bbb',
          display_name: 'Bob',
          hops: 2,
          aspect: 'lxmf.delivery',
          identity_hash: 'id_b',
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      destination_hash: 'bbb',
      aspect: 'lxmf.delivery',
      identity_hash: 'id_b',
      hops: 2,
    });
  });

  it('parses batched announces array payload with aspects', () => {
    const rows = parseAnnounceActivityRows({
      announces: [
        { destination_hash: 'aaa', aspect: 'rrc.hub', hops: 1 },
        { destination_hash: 'bbb', aspect: 'nomadnetwork.node', hops: 2 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.destination_hash)).toEqual(['aaa', 'bbb']);
    expect(rows.map((r) => r.aspect)).toEqual(['rrc.hub', 'nomadnetwork.node']);
  });
});

describe('announce-bus pressure activity gate', () => {
  afterEach(() => {
    resetReticulumIdentityActivityBatchForTests();
    useReticulumIdentityActivityStore.setState({ byDestination: new Map() });
    vi.unstubAllGlobals();
  });

  it('skips unknown-aspect SQLite upsert while pressure is active', async () => {
    vi.useFakeTimers();
    const upsertBatch = vi.fn().mockResolvedValue(undefined);
    const upsertOne = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      electronAPI: {
        db: {
          upsertReticulumIdentityActivityBatch: upsertBatch,
          upsertReticulumIdentityActivity: upsertOne,
        },
      },
    });
    try {
      setReticulumAnnounceBusPressureActive(true);
      await useReticulumIdentityActivityStore.getState().upsertActivity({
        destination_hash: 'deadbeef',
        aspect: 'unknown',
        last_seen: Date.now(),
      });
      await vi.advanceTimersByTimeAsync(600);
      expect(upsertBatch).not.toHaveBeenCalled();
      expect(upsertOne).not.toHaveBeenCalled();
      expect(useReticulumIdentityActivityStore.getState().getActivity('deadbeef')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still queues named-aspect activity while pressure is active', async () => {
    vi.useFakeTimers();
    const upsertBatch = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      electronAPI: {
        db: {
          upsertReticulumIdentityActivityBatch: upsertBatch,
          upsertReticulumIdentityActivity: vi.fn(),
        },
      },
    });
    try {
      setReticulumAnnounceBusPressureActive(true);
      await useReticulumIdentityActivityStore.getState().upsertActivity({
        destination_hash: 'cafebabe',
        aspect: 'lxmf.delivery',
        last_seen: Date.now(),
      });
      await vi.advanceTimersByTimeAsync(600);
      expect(upsertBatch).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('named-aspect upsert drops in-memory unknown placeholder for the same destination', async () => {
    vi.useFakeTimers();
    const upsertBatch = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      electronAPI: {
        db: {
          upsertReticulumIdentityActivityBatch: upsertBatch,
          upsertReticulumIdentityActivity: vi.fn(),
        },
      },
    });
    try {
      setReticulumAnnounceBusPressureActive(false);
      const store = useReticulumIdentityActivityStore.getState();
      await store.upsertActivity({
        destination_hash: 'aabbccdd',
        aspect: 'unknown',
        last_seen: 1,
      });
      await store.upsertActivity({
        destination_hash: 'aabbccdd',
        aspect: 'lxmf.delivery',
        identity_hash: 'id1',
        last_seen: 2,
      });
      await vi.advanceTimersByTimeAsync(600);
      const rows = useReticulumIdentityActivityStore.getState().getActivity('aabbccdd');
      expect(rows.map((r) => r.aspect)).toEqual(['lxmf.delivery']);
      expect(rows[0]?.identity_hash).toBe('id1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('loadForIdentity merges sibling destinations into byDestination', async () => {
    const identity = '11111111111111111111111111111111';
    const chat = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const voice = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const byIdentity = vi.fn().mockResolvedValue([
      {
        destination_hash: chat,
        aspect: 'lxmf.delivery',
        identity_hash: identity,
        last_seen: 10,
      },
      {
        destination_hash: voice,
        aspect: 'lxst.telephony',
        identity_hash: identity,
        last_seen: 20,
      },
    ]);
    vi.stubGlobal('window', {
      electronAPI: {
        db: {
          getReticulumIdentityActivityByIdentity: byIdentity,
        },
      },
    });
    const rows = await useReticulumIdentityActivityStore.getState().loadForIdentity(identity);
    expect(byIdentity).toHaveBeenCalledWith(identity);
    expect(rows).toHaveLength(2);
    expect(useReticulumIdentityActivityStore.getState().getActivity(chat)[0]?.aspect).toBe(
      'lxmf.delivery',
    );
    expect(useReticulumIdentityActivityStore.getState().getActivity(voice)[0]?.aspect).toBe(
      'lxst.telephony',
    );
  });
});
