/**
 * Build the Peer details announced-destination inventory for one RNS identity.
 */

import type { ReticulumIdentityActivityRow } from '@/renderer/stores/reticulumIdentityActivityStore';
import { canonicalizeReticulumDestinationHash } from '@/shared/reticulumDestinationHash';

export interface AnnouncedDestinationRow {
  destination_hash: string;
  aspect: string;
  last_seen: number;
  isOpened: boolean;
}

/**
 * Unique `(destination_hash, aspect)` rows for an identity, opened hash first then last_seen desc.
 * Without an identity hash, returns rows for the opened destination from cache (or a single unknown).
 * Returns [] when the opened hash (or a provided non-empty identity) is not a strict 32-hex hash.
 */
export function collectIdentityAnnouncedDestinations(
  openedDestinationHash: string,
  identityHash: string | null | undefined,
  byDestination: ReadonlyMap<string, ReticulumIdentityActivityRow[]>,
): AnnouncedDestinationRow[] {
  const opened = canonicalizeReticulumDestinationHash(openedDestinationHash);
  if (!opened) return [];

  let identity: string | null = null;
  if (identityHash != null && identityHash.trim() !== '') {
    identity = canonicalizeReticulumDestinationHash(identityHash);
    if (!identity) return [];
  }

  const bestByKey = new Map<string, AnnouncedDestinationRow>();
  /** Destinations that already have at least one non-unknown aspect. */
  const namedDests = new Set<string>();

  const consider = (row: ReticulumIdentityActivityRow) => {
    const dest = canonicalizeReticulumDestinationHash(row.destination_hash);
    if (!dest) return;
    const aspect = (row.aspect || 'unknown').trim() || 'unknown';
    if (aspect === 'unknown' && namedDests.has(dest)) return;

    const key = `${dest}\0${aspect}`;
    const prev = bestByKey.get(key);
    const lastSeen = Number.isFinite(row.last_seen) ? row.last_seen : 0;
    if (!prev || lastSeen > prev.last_seen) {
      bestByKey.set(key, {
        destination_hash: dest,
        aspect,
        last_seen: lastSeen,
        isOpened: dest === opened,
      });
    }

    if (aspect !== 'unknown') {
      namedDests.add(dest);
      // Drop a previously collected unknown placeholder for this destination.
      bestByKey.delete(`${dest}\0unknown`);
    }
  };

  if (identity) {
    for (const rows of byDestination.values()) {
      for (const row of rows) {
        const rowId = row.identity_hash
          ? canonicalizeReticulumDestinationHash(row.identity_hash)
          : null;
        if (rowId !== identity) continue;
        consider(row);
      }
    }
  }

  if (bestByKey.size === 0) {
    const local = byDestination.get(opened) ?? [];
    if (local.length === 0) {
      return [
        {
          destination_hash: opened,
          aspect: 'unknown',
          last_seen: 0,
          isOpened: true,
        },
      ];
    }
    for (const row of local) consider(row);
  }

  // Ensure the opened destination appears even if activity lacked identity linkage.
  const hasOpened = [...bestByKey.values()].some((r) => r.destination_hash === opened);
  if (!hasOpened) {
    const local = byDestination.get(opened) ?? [];
    for (const row of local) consider(row);
    if (![...bestByKey.values()].some((r) => r.destination_hash === opened)) {
      bestByKey.set(`${opened}\0unknown`, {
        destination_hash: opened,
        aspect: 'unknown',
        last_seen: 0,
        isOpened: true,
      });
    }
  }

  return [...bestByKey.values()].sort((a, b) => {
    if (a.isOpened !== b.isOpened) return a.isOpened ? -1 : 1;
    return b.last_seen - a.last_seen;
  });
}
