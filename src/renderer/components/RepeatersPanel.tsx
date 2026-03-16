import { useState } from 'react';

import type { MeshCoreRepeaterStatus } from '../hooks/useMeshCore';
import type { MeshNode } from '../lib/types';
import { useRepeaterSignalStore } from '../stores/repeaterSignalStore';
import { useToast } from './Toast';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface Props {
  nodes: Map<number, MeshNode>;
  meshcoreNodeStatus: Map<number, MeshCoreRepeaterStatus>;
  meshcoreTraceResults: Map<number, { hops: { snr: number }[]; lastSnr: number }>;
  onRequestRepeaterStatus: (nodeId: number) => Promise<void>;
  onPing: (nodeId: number) => Promise<void>;
  onImportRepeaters: () => Promise<ImportResult>;
  onDeleteRepeater: (nodeId: number) => Promise<void>;
  isConnected: boolean;
}

const STALE_THRESHOLD_MS = 15 * 60 * 1000;

function getRepeaterStatus(lastHeard: number | null | undefined): 'active' | 'stale' | 'unknown' {
  if (!lastHeard) return 'unknown';
  const ageMs = Date.now() - lastHeard * 1000;
  return ageMs < STALE_THRESHOLD_MS ? 'active' : 'stale';
}

function formatRelativeTime(lastHeard: number | null | undefined): string {
  if (!lastHeard) return 'Never';
  const ageMs = Date.now() - lastHeard * 1000;
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  if (ageHr < 24) return `${ageHr}h ago`;
  return `${Math.floor(ageHr / 24)}d ago`;
}

function formatUptime(secs: number | undefined): string {
  if (!secs) return '—';
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function SignalSparkline({ points }: { points: { ts: number; snr: number }[] }) {
  if (points.length < 2) return <span className="text-gray-600 text-xs">—</span>;
  const W = 80,
    H = 24;
  const snrs = points.map((p) => p.snr);
  const minS = Math.min(...snrs),
    maxS = Math.max(...snrs);
  const range = maxS - minS || 1;
  const minT = points[0].ts,
    maxT = points[points.length - 1].ts;
  const timeRange = maxT - minT || 1;
  const toX = (t: number) => ((t - minT) / timeRange) * W;
  const toY = (s: number) => H - ((s - minS) / range) * H;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.ts).toFixed(1)},${toY(p.snr).toFixed(1)}`)
    .join(' ');
  const latest = points[points.length - 1];
  const tooltip = `${latest.snr.toFixed(1)} dB · ${formatRelativeTime(latest.ts / 1000)}`;
  return (
    <svg width={W} height={H} className="text-brand-green">
      <title>{tooltip}</title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function RepeatersPanel({
  nodes,
  meshcoreNodeStatus,
  meshcoreTraceResults,
  onRequestRepeaterStatus,
  onPing,
  onImportRepeaters,
  onDeleteRepeater,
  isConnected,
}: Props) {
  const { addToast } = useToast();
  const signalHistory = useRepeaterSignalStore((s) => s.history);
  const [statusLoadingSet, setStatusLoadingSet] = useState<Set<number>>(new Set());
  const [pingLoadingSet, setPingLoadingSet] = useState<Set<number>>(new Set());
  const [pingErrorSet, setPingErrorSet] = useState<Set<number>>(new Set());
  const [deleteLoadingSet, setDeleteLoadingSet] = useState<Set<number>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  const repeaters = Array.from(nodes.values())
    .filter((n) => n.hw_model === 'Repeater')
    .sort((a, b) => (b.last_heard ?? 0) - (a.last_heard ?? 0));

  const handleImport = async () => {
    setImportLoading(true);
    try {
      const result = await onImportRepeaters();
      if (result.imported === 0 && result.skipped === 0 && result.errors.length === 0) return;
      const msg =
        result.errors.length > 0
          ? `Imported ${result.imported}, skipped ${result.skipped}. Errors: ${result.errors.slice(0, 3).join('; ')}`
          : `Imported ${result.imported} repeater${result.imported !== 1 ? 's' : ''}${result.skipped > 0 ? `, skipped ${result.skipped}` : ''}.`;
      addToast(msg, result.errors.length > 0 ? 'error' : 'success');
    } catch (e) {
      addToast(`Import failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleStatus = async (nodeId: number) => {
    setStatusLoadingSet((prev) => new Set([...prev, nodeId]));
    try {
      await onRequestRepeaterStatus(nodeId);
    } catch (e) {
      console.warn('[RepeatersPanel] requestRepeaterStatus error', e);
    } finally {
      setStatusLoadingSet((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const handlePing = async (nodeId: number) => {
    setPingLoadingSet((prev) => new Set([...prev, nodeId]));
    setPingErrorSet((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
    try {
      await onPing(nodeId);
    } catch (e) {
      console.warn('[RepeatersPanel] ping error', e);
      setPingErrorSet((prev) => new Set([...prev, nodeId]));
      setTimeout(() => {
        setPingErrorSet((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }, 3000);
    } finally {
      setPingLoadingSet((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  const handleDelete = async (nodeId: number) => {
    if (deleteConfirmId !== nodeId) {
      setDeleteConfirmId(nodeId);
      return;
    }
    setDeleteConfirmId(null);
    setDeleteLoadingSet((prev) => new Set([...prev, nodeId]));
    try {
      await onDeleteRepeater(nodeId);
    } catch (e) {
      addToast(`Remove failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setDeleteLoadingSet((prev) => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-bright-green">Repeaters</h2>
        <button
          onClick={handleImport}
          disabled={importLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-brand-green/20 text-brand-green border border-brand-green/30 hover:bg-brand-green/30 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {importLoading ? (
            <span className="w-3 h-3 border border-brand-green border-t-transparent rounded-full animate-spin inline-block" />
          ) : null}
          Import Repeaters
        </button>
      </div>

      {repeaters.length === 0 ? (
        <div className="text-gray-400 text-sm mt-8 text-center">
          <p>No repeaters discovered yet.</p>
          <p className="mt-1 text-gray-500">
            Repeaters appear when contacts with type &ldquo;Repeater&rdquo; advertise. Use Import to
            pre-load nicknames.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Last Heard</th>
                <th className="py-2 pr-4 font-medium">SNR</th>
                <th className="py-2 pr-4 font-medium">RSSI</th>
                <th className="py-2 pr-4 font-medium">Hops</th>
                <th className="py-2 pr-4 font-medium">Uptime</th>
                <th className="py-2 pr-4 font-medium">Air%</th>
                <th className="py-2 pr-4 font-medium">Path History</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {repeaters.map((node) => {
                const status = meshcoreNodeStatus.get(node.node_id);
                const traceResult = meshcoreTraceResults.get(node.node_id);
                const repeaterStatus = getRepeaterStatus(node.last_heard);
                const history = signalHistory.get(node.node_id) ?? [];
                const airPct =
                  status?.totalAirTimeSecs && status?.totalUpTimeSecs
                    ? ((status.totalAirTimeSecs / status.totalUpTimeSecs) * 100).toFixed(1)
                    : null;
                const isStatusLoading = statusLoadingSet.has(node.node_id);
                const isPingLoading = pingLoadingSet.has(node.node_id);
                const hasPingError = pingErrorSet.has(node.node_id);
                const isDeleteLoading = deleteLoadingSet.has(node.node_id);
                const isDeleteConfirm = deleteConfirmId === node.node_id;

                return (
                  <tr key={node.node_id} className="text-gray-300 hover:bg-gray-800/30">
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            repeaterStatus === 'active'
                              ? 'bg-green-500'
                              : repeaterStatus === 'stale'
                                ? 'bg-amber-500'
                                : 'bg-gray-500'
                          }`}
                        />
                        <span
                          className={
                            repeaterStatus === 'active'
                              ? 'text-green-400 text-xs'
                              : repeaterStatus === 'stale'
                                ? 'text-amber-400 text-xs'
                                : 'text-gray-500 text-xs'
                          }
                        >
                          {repeaterStatus === 'active'
                            ? 'Active'
                            : repeaterStatus === 'stale'
                              ? 'Stale'
                              : '—'}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-medium text-white">{node.long_name}</td>
                    <td className="py-2 pr-4 text-gray-400 text-xs">
                      {formatRelativeTime(node.last_heard)}
                    </td>
                    <td className="py-2 pr-4">{node.snr != null ? node.snr.toFixed(1) : '—'}</td>
                    <td className="py-2 pr-4">{node.rssi != null ? node.rssi : '—'}</td>
                    <td className="py-2 pr-4">{traceResult ? traceResult.hops.length : '—'}</td>
                    <td className="py-2 pr-4">{formatUptime(status?.totalUpTimeSecs)}</td>
                    <td className="py-2 pr-4">{airPct != null ? `${airPct}%` : '—'}</td>
                    <td className="py-2 pr-4">
                      <SignalSparkline points={history} />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => void handlePing(node.node_id)}
                          disabled={!isConnected || isPingLoading}
                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-40 ${
                            hasPingError
                              ? 'bg-red-900/60 text-red-300 border border-red-700'
                              : 'bg-blue-900/60 text-blue-300 border border-blue-700 hover:bg-blue-800/60'
                          }`}
                        >
                          {isPingLoading ? (
                            <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                          ) : hasPingError ? (
                            'Error'
                          ) : (
                            'Ping'
                          )}
                        </button>
                        <button
                          onClick={() => void handleStatus(node.node_id)}
                          disabled={!isConnected || isStatusLoading}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700 transition-colors disabled:opacity-40"
                        >
                          {isStatusLoading ? (
                            <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                          ) : (
                            'Status'
                          )}
                        </button>
                        <button
                          onClick={() => void handleDelete(node.node_id)}
                          disabled={isDeleteLoading}
                          onBlur={() => {
                            if (isDeleteConfirm) setDeleteConfirmId(null);
                          }}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/60 text-red-300 border border-red-700 hover:bg-red-800/60 transition-colors disabled:opacity-40"
                        >
                          {isDeleteLoading ? (
                            <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                          ) : isDeleteConfirm ? (
                            'Confirm?'
                          ) : (
                            'Remove'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
