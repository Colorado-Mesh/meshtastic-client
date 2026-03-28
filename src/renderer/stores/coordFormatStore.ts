import { create } from 'zustand';

import type { CoordinateFormat } from '../lib/coordUtils';
import { parseStoredJson } from '../lib/parseStoredJson';

function loadCoordinateFormat(): CoordinateFormat {
  const o = parseStoredJson<{ coordinateFormat?: string }>(
    localStorage.getItem('mesh-client:adminSettings'),
    'coordFormatStore loadCoordinateFormat',
  );
  return o?.coordinateFormat === 'mgrs' ? 'mgrs' : 'decimal';
}

interface CoordFormatState {
  coordinateFormat: CoordinateFormat;
  setCoordinateFormat(format: CoordinateFormat): void;
}

export const useCoordFormatStore = create<CoordFormatState>((set) => ({
  coordinateFormat: loadCoordinateFormat(),
  setCoordinateFormat(format) {
    try {
      const raw = localStorage.getItem('mesh-client:adminSettings');
      const o = parseStoredJson<Record<string, unknown>>(raw, 'coordFormatStore set') ?? {};
      localStorage.setItem(
        'mesh-client:adminSettings',
        JSON.stringify({ ...o, coordinateFormat: format }),
      );
    } catch {
      // catch-no-log-ok localStorage unavailable in private/restricted environments
    }
    set({ coordinateFormat: format });
  },
}));
