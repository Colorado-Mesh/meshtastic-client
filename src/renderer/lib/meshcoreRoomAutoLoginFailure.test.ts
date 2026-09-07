import { describe, expect, it, vi } from 'vitest';

import {
  clearAllMeshcoreRoomAutoLoginFailures,
  clearMeshcoreRoomAutoLoginFailure,
  clearTransientMeshcoreRoomAutoLoginFailures,
  getMeshcoreRoomAutoLoginFailure,
  setMeshcoreRoomAutoLoginFailure,
  shouldSkipMeshcoreRoomAutoLogin,
  subscribeMeshcoreRoomAutoLoginFailureChanges,
} from './meshcoreRoomAutoLoginFailure';

describe('meshcoreRoomAutoLoginFailure', () => {
  it('stores and clears failure per room', () => {
    clearMeshcoreRoomAutoLoginFailure(42);
    expect(getMeshcoreRoomAutoLoginFailure(42)).toBeUndefined();
    setMeshcoreRoomAutoLoginFailure(42, 'timeout');
    expect(getMeshcoreRoomAutoLoginFailure(42)).toBe('timeout');
    clearMeshcoreRoomAutoLoginFailure(42);
    expect(getMeshcoreRoomAutoLoginFailure(42)).toBeUndefined();
  });

  it('notifies subscribers on set and clear', () => {
    const cb = vi.fn();
    const unsub = subscribeMeshcoreRoomAutoLoginFailureChanges(cb);
    setMeshcoreRoomAutoLoginFailure(1, 'login failed');
    expect(cb).toHaveBeenCalledTimes(1);
    clearMeshcoreRoomAutoLoginFailure(1);
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    setMeshcoreRoomAutoLoginFailure(1, 'again');
    expect(cb).toHaveBeenCalledTimes(2);
    clearMeshcoreRoomAutoLoginFailure(1);
  });

  it('only stickySkip failures block connect auto-login', () => {
    clearAllMeshcoreRoomAutoLoginFailures();
    setMeshcoreRoomAutoLoginFailure(7, 'timeout');
    expect(getMeshcoreRoomAutoLoginFailure(7)).toBe('timeout');
    expect(shouldSkipMeshcoreRoomAutoLogin(7)).toBe(false);

    setMeshcoreRoomAutoLoginFailure(7, 'room login rejected', { stickySkip: true });
    expect(shouldSkipMeshcoreRoomAutoLogin(7)).toBe(true);

    clearTransientMeshcoreRoomAutoLoginFailures();
    expect(getMeshcoreRoomAutoLoginFailure(7)).toBe('room login rejected');
    expect(shouldSkipMeshcoreRoomAutoLogin(7)).toBe(true);

    setMeshcoreRoomAutoLoginFailure(8, 'path sync failed');
    clearTransientMeshcoreRoomAutoLoginFailures();
    expect(getMeshcoreRoomAutoLoginFailure(8)).toBeUndefined();
    expect(getMeshcoreRoomAutoLoginFailure(7)).toBe('room login rejected');
    clearAllMeshcoreRoomAutoLoginFailures();
  });
});
