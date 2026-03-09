// Time thresholds for node freshness
const STALE_MS = 2 * 3_600_000; // 2 hours
const OFFLINE_MS = 72 * 3_600_000; // 72 hours

export type NodeStatus = 'online' | 'stale' | 'offline';

export function getNodeStatus(lastHeard: number): NodeStatus {
  if (!lastHeard || !Number.isFinite(lastHeard)) return 'offline';
  const diff = Date.now() - lastHeard;
  if (diff < STALE_MS) return 'online';
  if (diff < OFFLINE_MS) return 'stale';
  return 'offline';
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return NaN;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
