import { describe, expect, it } from 'vitest';

import {
  remapDmMutedViews,
  remapDmStarredViewKeys,
  remapDmViewKeyedRecord,
  remapReticulumChatDmTabIds,
} from './remapReticulumChatDmTabs';

describe('remapReticulumChatDmTabIds', () => {
  it('rewrites open/active/dismissed ids and merges duplicates', () => {
    const telephony = 111;
    const lxmf = 222;
    const other = 333;
    const result = remapReticulumChatDmTabIds(
      [telephony, other, telephony],
      telephony,
      { [telephony]: 2, [lxmf]: 5, [other]: 1 },
      (id) => (id === telephony ? lxmf : id),
    );
    expect(result.openDmTabs).toEqual([lxmf, other]);
    expect(result.activeDmNode).toBe(lxmf);
    expect(result.dismissedDmTabs).toEqual({ [lxmf]: 5, [other]: 1 });
    expect(result.replacements).toEqual([{ from: telephony, to: lxmf }]);
    expect(result.changed).toBe(true);
  });

  it('is a no-op when canonicalize is identity', () => {
    const result = remapReticulumChatDmTabIds([10, 20], 10, { 10: 1 }, (id) => id);
    expect(result.changed).toBe(false);
    expect(result.replacements).toEqual([]);
    expect(result.openDmTabs).toEqual([10, 20]);
    expect(result.activeDmNode).toBe(10);
  });
});

describe('remapDmViewKeyedRecord', () => {
  it('renames dm keys and max-merges last-read watermarks', () => {
    const { next, changed } = remapDmViewKeyedRecord(
      { 'dm:111': 1000, 'dm:222': 2500, 'ch:0': 9 },
      [{ from: 111, to: 222 }],
      (a, b) => Math.max(a, b),
    );
    expect(changed).toBe(true);
    expect(next).toEqual({ 'dm:222': 2500, 'ch:0': 9 });
  });
});

describe('remapDmMutedViews', () => {
  it('renames muted dm view keys', () => {
    const { next, changed } = remapDmMutedViews(new Set(['dm:111', 'ch:0']), [
      { from: 111, to: 222 },
    ]);
    expect(changed).toBe(true);
    expect([...next].sort()).toEqual(['ch:0', 'dm:222']);
  });
});

describe('remapDmStarredViewKeys', () => {
  it('rewrites starred viewKey for remapped peers', () => {
    const { next, changed } = remapDmStarredViewKeys(
      [
        { viewKey: 'dm:111', starId: 'a' },
        { viewKey: 'ch:0', starId: 'b' },
      ],
      [{ from: 111, to: 222 }],
    );
    expect(changed).toBe(true);
    expect(next).toEqual([
      { viewKey: 'dm:222', starId: 'a' },
      { viewKey: 'ch:0', starId: 'b' },
    ]);
  });
});
