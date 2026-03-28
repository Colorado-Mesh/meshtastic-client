import { describe, expect, it } from 'vitest';

import {
  lastHeardToUnixSeconds,
  mergeMeshcoreLastHeardFromAdvert,
  normalizeLastHeardMs,
} from './nodeStatus';

describe('lastHeardToUnixSeconds', () => {
  it('returns 0 for invalid input', () => {
    expect(lastHeardToUnixSeconds(0)).toBe(0);
    expect(lastHeardToUnixSeconds(NaN)).toBe(0);
  });

  it('treats values below 1e12 as epoch seconds', () => {
    expect(lastHeardToUnixSeconds(1_700_000_000)).toBe(1_700_000_000);
  });

  it('treats values at or above 1e12 as epoch milliseconds', () => {
    expect(lastHeardToUnixSeconds(1_700_000_000_000)).toBe(1_700_000_000);
  });
});

describe('mergeMeshcoreLastHeardFromAdvert', () => {
  it('prefers positive device lastAdvert', () => {
    expect(mergeMeshcoreLastHeardFromAdvert(1_700_000_100, 1_700_000_500)).toBe(1_700_000_100);
  });

  it('preserves previous last_heard when device advert is 0', () => {
    expect(mergeMeshcoreLastHeardFromAdvert(0, 1_700_000_200)).toBe(1_700_000_200);
  });

  it('preserves previous last_heard in ms when device advert is missing', () => {
    const prevMs = 1_700_000_200_000;
    expect(mergeMeshcoreLastHeardFromAdvert(undefined, prevMs)).toBe(1_700_000_200);
  });

  it('returns 0 when both are empty', () => {
    expect(mergeMeshcoreLastHeardFromAdvert(0, 0)).toBe(0);
    expect(mergeMeshcoreLastHeardFromAdvert(null, undefined)).toBe(0);
  });

  it('aligns with normalizeLastHeardMs for UI freshness', () => {
    const merged = mergeMeshcoreLastHeardFromAdvert(0, 1_700_000_000);
    expect(normalizeLastHeardMs(merged)).toBe(1_700_000_000_000);
  });
});
