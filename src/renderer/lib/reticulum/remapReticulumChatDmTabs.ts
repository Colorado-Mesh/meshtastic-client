/**
 * Migrate persisted Chat DM tab ids from remappable non-LXMF folds (e.g. telephony)
 * onto the peer's canonical lxmf.delivery fold.
 */

import { remapReticulumChatDmTabNodeId } from '@/renderer/lib/reticulum/resolveReticulumChatLxmfDest';

export interface RemapReticulumChatDmTabIdsResult {
  openDmTabs: number[];
  activeDmNode: number | null;
  dismissedDmTabs: Record<number, number>;
  /** old → new when remapped (excludes identity mappings). */
  replacements: { from: number; to: number }[];
  changed: boolean;
}

function dedupePreserveOrder(ids: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    const n = id >>> 0;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** Rewrite open/active/dismissed DM ids through LXMF canonicalization. */
export function remapReticulumChatDmTabIds(
  openDmTabs: readonly number[],
  activeDmNode: number | null,
  dismissedDmTabs: Readonly<Record<number, number>>,
  canonicalize: (nodeId: number) => number = remapReticulumChatDmTabNodeId,
): RemapReticulumChatDmTabIdsResult {
  const replacements: { from: number; to: number }[] = [];
  const seenFrom = new Set<number>();

  const mapId = (id: number): number => {
    const from = id >>> 0;
    const to = canonicalize(from) >>> 0;
    if (to !== from && !seenFrom.has(from)) {
      seenFrom.add(from);
      replacements.push({ from, to });
    }
    return to;
  };

  const nextOpen = dedupePreserveOrder(openDmTabs.map(mapId));
  const nextActive = activeDmNode == null ? null : mapId(activeDmNode);

  const nextDismissed: Record<number, number> = {};
  for (const [key, value] of Object.entries(dismissedDmTabs)) {
    const from = Number(key);
    if (!Number.isFinite(from) || typeof value !== 'number') continue;
    const to = mapId(from);
    if (Object.hasOwn(nextDismissed, to)) {
      nextDismissed[to] = Math.max(nextDismissed[to], value);
    } else {
      nextDismissed[to] = value;
    }
  }

  const openChanged =
    nextOpen.length !== openDmTabs.length ||
    nextOpen.some((id, i) => id !== (openDmTabs[i] ?? 0) >>> 0);
  const activeChanged = (activeDmNode == null ? null : activeDmNode >>> 0) !== nextActive;
  const dismissedKeys = Object.keys(dismissedDmTabs);
  const nextDismissedKeys = Object.keys(nextDismissed);
  const dismissedChanged =
    dismissedKeys.length !== nextDismissedKeys.length ||
    replacements.length > 0 ||
    dismissedKeys.some((k) => {
      const from = Number(k) >>> 0;
      const to = canonicalize(from) >>> 0;
      return from !== to || dismissedDmTabs[from] !== nextDismissed[to];
    });

  return {
    openDmTabs: nextOpen,
    activeDmNode: nextActive,
    dismissedDmTabs: nextDismissed,
    replacements,
    changed: openChanged || activeChanged || dismissedChanged || replacements.length > 0,
  };
}

/** Rename `dm:old` → `dm:new` keys; merge with `merge` when both exist. */
export function remapDmViewKeyedRecord<T>(
  record: Readonly<Record<string, T>>,
  replacements: readonly { from: number; to: number }[],
  merge: (existing: T, incoming: T) => T,
): { next: Record<string, T>; changed: boolean } {
  if (replacements.length === 0) {
    return { next: { ...record }, changed: false };
  }
  const rename = new Map<string, string>();
  for (const { from, to } of replacements) {
    rename.set(`dm:${String(from >>> 0)}`, `dm:${String(to >>> 0)}`);
  }
  const next: Record<string, T> = {};
  let changed = false;
  for (const [key, value] of Object.entries(record)) {
    const dest = rename.get(key) ?? key;
    if (dest !== key) changed = true;
    if (Object.prototype.hasOwnProperty.call(next, dest)) {
      next[dest] = merge(next[dest], value);
      changed = true;
    } else {
      next[dest] = value;
    }
  }
  return { next, changed };
}

/** Rename muted `dm:` view keys for remapped peers. */
export function remapDmMutedViews(
  muted: ReadonlySet<string>,
  replacements: readonly { from: number; to: number }[],
): { next: Set<string>; changed: boolean } {
  if (replacements.length === 0) {
    return { next: new Set(muted), changed: false };
  }
  const rename = new Map<string, string>();
  for (const { from, to } of replacements) {
    rename.set(`dm:${String(from >>> 0)}`, `dm:${String(to >>> 0)}`);
  }
  const next = new Set<string>();
  let changed = false;
  for (const key of muted) {
    const dest = rename.get(key) ?? key;
    if (dest !== key) changed = true;
    next.add(dest);
  }
  return { next, changed };
}

/** Rename starred message viewKeys that are `dm:` peers. */
export function remapDmStarredViewKeys<T extends { viewKey: string }>(
  starred: readonly T[],
  replacements: readonly { from: number; to: number }[],
): { next: T[]; changed: boolean } {
  if (replacements.length === 0) {
    return { next: [...starred], changed: false };
  }
  const rename = new Map<string, string>();
  for (const { from, to } of replacements) {
    rename.set(`dm:${String(from >>> 0)}`, `dm:${String(to >>> 0)}`);
  }
  let changed = false;
  const next = starred.map((entry) => {
    const dest = rename.get(entry.viewKey);
    if (!dest || dest === entry.viewKey) return entry;
    changed = true;
    return { ...entry, viewKey: dest };
  });
  return { next, changed };
}
