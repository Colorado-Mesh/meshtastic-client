import { describe, expect, it } from 'vitest';

import { analyzeLogs, type LogEntry } from './logAnalyzer';
import type { MeshProtocol } from './types';

function entry(message: string, level = 'warn', ts = 1000): LogEntry {
  return { ts, level, source: 'main', message };
}

// Fixtures mirror production emitters; keep failure text and harmless counterexamples together.
const fixtures: { category: string; protocol: MeshProtocol; message: string }[] = [
  {
    category: 'renderer-unresponsive',
    protocol: 'meshtastic',
    message: '[main] renderer unresponsive after system resume (no heartbeat within 30s)',
  },
  {
    category: 'renderer-unresponsive',
    protocol: 'meshcore',
    message: '[main] renderer webContents unresponsive',
  },
  {
    category: 'renderer-unresponsive',
    protocol: 'reticulum',
    message: '[main] renderer heartbeat stalled (no heartbeat while window visible)',
  },
  {
    category: 'database-persistence',
    protocol: 'meshtastic',
    message:
      '[dbPersistRetry] degraded persistence: saveNode failed after retries: database is locked',
  },
  {
    category: 'database-persistence',
    protocol: 'meshcore',
    message:
      '[dbPersistRetry] degraded persistence: queue full; dropping saveMeshcoreContact: disk full',
  },
  {
    category: 'meshtastic-tcp',
    protocol: 'meshtastic',
    message: '[IPC] meshtastic:tcp-connect error: ECONNREFUSED',
  },
  {
    category: 'meshtastic-tcp',
    protocol: 'meshtastic',
    message: '[IPC] meshtastic:tcp-write error: broken pipe',
  },
  {
    category: 'reticulum-sidecar',
    protocol: 'reticulum',
    message: '[reticulumSidecarWatchdog] hung poll failure 2/2: status 503',
  },
  {
    category: 'reticulum-sidecar',
    protocol: 'reticulum',
    message: '[reticulumSidecarWatchdog] restarting hung sidecar',
  },
  {
    category: 'reticulum-sidecar',
    protocol: 'reticulum',
    message: '[ReticulumIPC] start failed: RETICULUM_SIDECAR_BUNDLED_MISSING',
  },
  {
    category: 'reticulum-sidecar',
    protocol: 'reticulum',
    message: '[ReticulumSidecar] ws error: ECONNRESET',
  },
  {
    category: 'reticulum-sidecar',
    protocol: 'reticulum',
    message: '[ReticulumSidecar] voice ws bridge unavailable: socket closed',
  },
  {
    category: 'reticulum-delivery',
    protocol: 'reticulum',
    message:
      '[ReticulumSidecar] WARN lxmf-outbound: LXMF outbound delivery failed dest=abc attempts=3',
  },
  {
    category: 'reticulum-delivery',
    protocol: 'reticulum',
    message: '[ReticulumSidecar] WARN LXMF path request budget exhausted; marking outbound failed',
  },
  {
    category: 'reticulum-delivery',
    protocol: 'reticulum',
    message: '[reticulumPropagationStore] sync Error: PROPAGATION_PATH_UNKNOWN',
  },
  {
    category: 'reticulum-backpressure',
    protocol: 'reticulum',
    message:
      '[ReticulumSidecar] WARN LXMF outbound backchannel saturated — dropping newest packet capacity=64',
  },
  {
    category: 'reticulum-backpressure',
    protocol: 'reticulum',
    message:
      '[ReticulumSidecar] WARN LXMF inbound raw channel full; dropping newest opportunistic packet',
  },
  {
    category: 'reticulum-backpressure',
    protocol: 'reticulum',
    message:
      '[ReticulumSidecar] WARN websocket event subscriber lagged; some events dropped skipped=5',
  },
  {
    category: 'reticulum-backpressure',
    protocol: 'reticulum',
    message:
      '[ReticulumSidecar] WARN voice audio websocket subscriber lagged; frames dropped skipped=5',
  },
  {
    category: 'reticulum-backpressure',
    protocol: 'reticulum',
    message: '[ReticulumSidecar] ws message exceeded 1048576 byte cap, dropping',
  },
  {
    category: 'firmware-flash',
    protocol: 'meshtastic',
    message: '[nrf52DfuFlasher] sendFirmware stalled — closing serial port',
  },
  {
    category: 'firmware-flash',
    protocol: 'meshcore',
    message: '[esp32Flasher] writeFlash stalled — closing serial port',
  },
];

describe('current production log messages', () => {
  it.each(fixtures)('classifies $category: $message', ({ category, protocol, message }) => {
    const result = analyzeLogs([entry(message)], protocol);
    expect(result.categories.find((finding) => finding.id === category)?.count).toBe(1);
    expect(result.categories.find((finding) => finding.id === 'unclassified')).toBeUndefined();
  });

  it.each(fixtures)('does not diagnose debug-only $category', ({ category, protocol, message }) => {
    expect(
      analyzeLogs([entry(message, 'debug')], protocol).categories.find(
        (finding) => finding.id === category,
      ),
    ).toBeUndefined();
  });

  it.each([
    '[main] renderer webContents responsive again',
    '[ReticulumSidecar] exited code=0 signal=null',
    '[useReticulumRuntime] restarting stack to reload interface config',
    '[ReticulumSidecar] INFO propagation-deposit: stored at propagation node',
    '[ReticulumSidecar] WARN LXMF inbound opportunistic packet len=123',
  ])('does not infer an outage from routine progress: %s', (message) => {
    const warning = entry(message);
    const categories = analyzeLogs([warning], 'reticulum').categories;
    expect(categories).toEqual([
      expect.objectContaining({ id: 'unclassified', count: 1, entries: [warning] }),
    ]);
  });

  it('does not suggest LoRa channel keys for Reticulum decryption failures', () => {
    const result = analyzeLogs(
      [entry('[ReticulumSidecar] WARN opportunistic LXMF decrypt failed')],
      'reticulum',
    );
    expect(result.categories.map((finding) => finding.id)).toEqual(['reticulum-delivery']);
  });

  it('gates stack-specific guidance', () => {
    expect(
      analyzeLogs([entry('[ReticulumIPC] start failed: unavailable')], 'meshcore').categories.map(
        (finding) => finding.id,
      ),
    ).toEqual(['unclassified']);
    expect(
      analyzeLogs(
        [entry('[IPC] meshtastic:tcp-connect error: refused')],
        'reticulum',
      ).categories.map((finding) => finding.id),
    ).toEqual(['unclassified']);
  });
});

describe('finding evidence', () => {
  it('keeps the original messages, newest first, without changing the input', () => {
    const oldest = entry(
      '[dbPersistRetry] degraded persistence: first failed after retries',
      'warn',
      1,
    );
    const newest = entry(
      '[dbPersistRetry] degraded persistence: second failed after retries',
      'warn',
      3,
    );
    const input = [oldest, entry('normal progress', 'info', 2), newest];
    const result = analyzeLogs(input, 'meshtastic');
    const finding = result.categories[0];
    expect(finding.entries).toEqual([newest, oldest]);
    expect(finding.lastTs).toBe(3);
    expect(input[0]).toBe(oldest);
    expect(finding.entries[0]).toBe(newest);
  });

  it('surfaces unmatched errors once, without double-counting recognized warnings', () => {
    const unknown = entry('[FutureModule] request failed', 'error');
    const known = entry('[dbPersistRetry] degraded persistence: save failed after retries');
    const result = analyzeLogs([known, unknown, entry('normal progress', 'info')], 'meshtastic');
    expect(result.categories.find((finding) => finding.id === 'unclassified')).toMatchObject({
      count: 1,
      severity: 'error',
      entries: [unknown],
    });
  });

  it('preserves cancelled-navigation noise suppression in the fallback', () => {
    expect(
      analyzeLogs([entry('[main] Failed to load: -3 ERR_ABORTED', 'error')], 'meshtastic')
        .categories,
    ).toEqual([]);
  });
});
