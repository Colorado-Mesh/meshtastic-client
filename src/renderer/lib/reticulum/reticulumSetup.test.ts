import { describe, expect, it, vi } from 'vitest';

import { RETICULUM_DEFAULT_HUB_PRESETS } from './reticulumDefaultHubPresets';
import {
  enableReticulumSetupHub,
  onlineReticulumSetupInterfaces,
  readReticulumSetupSnapshot,
  saveReticulumSetupIdentity,
} from './reticulumSetup';

const hub = RETICULUM_DEFAULT_HUB_PRESETS[0];
const existing = {
  id: 'saved-hub',
  name: hub.name,
  type: hub.type,
  host: hub.host,
  port: hub.port,
  enabled: false,
  status: 'down',
};
function api() {
  return {
    proxyGet: vi.fn().mockResolvedValue({ interfaces: [] }),
    proxyPost: vi.fn().mockResolvedValue({ ok: true }),
    proxyPut: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe('guided Reticulum connection setup', () => {
  it('adds only the selected hub, enabled with the existing default connection mode', async () => {
    const bridge = api();
    await enableReticulumSetupHub(bridge, hub);
    expect(bridge.proxyPost).toHaveBeenCalledExactlyOnceWith('/api/v1/interfaces', {
      name: hub.name,
      type: 'tcp',
      host: hub.host,
      port: hub.port,
      enabled: true,
      mode: 'boundary',
    });
    expect(bridge.proxyPut).not.toHaveBeenCalled();
  });

  it('reuses a disabled hub without changing its other settings', async () => {
    const bridge = api();
    bridge.proxyGet.mockResolvedValue({ interfaces: [{ ...existing, mode: 'full' }] });
    await enableReticulumSetupHub(bridge, hub);
    expect(bridge.proxyPut).toHaveBeenCalledExactlyOnceWith('/api/v1/interfaces/saved-hub', {
      enabled: true,
    });
    expect(bridge.proxyPost).not.toHaveBeenCalled();
  });

  it('does not duplicate a saved connection on retry after restart failure', async () => {
    const bridge = api();
    await enableReticulumSetupHub(bridge, hub);
    bridge.proxyGet.mockResolvedValue({ interfaces: [{ ...existing, enabled: true }] });
    await enableReticulumSetupHub(bridge, hub);
    expect(bridge.proxyPost).toHaveBeenCalledTimes(1);
    expect(bridge.proxyPut).not.toHaveBeenCalled();
  });

  it('does not alter a matching private network connection', async () => {
    const bridge = api();
    bridge.proxyGet.mockResolvedValue({ interfaces: [{ ...existing, network_name: 'private' }] });
    await expect(enableReticulumSetupHub(bridge, hub)).rejects.toThrow('SETUP_PRIVATE_INTERFACE');
    expect(bridge.proxyPut).not.toHaveBeenCalled();
  });

  it.each([{}, { ok: false, error: 'unavailable' }])(
    'fails closed when settings cannot be read: %j',
    async (response) => {
      const bridge = api();
      bridge.proxyGet.mockResolvedValue(response);
      await expect(enableReticulumSetupHub(bridge, hub)).rejects.toThrow(
        'SETUP_INTERFACES_UNAVAILABLE',
      );
      expect(bridge.proxyPost).not.toHaveBeenCalled();
    },
  );

  it('surfaces a rejected save instead of restarting with incomplete settings', async () => {
    const bridge = api();
    bridge.proxyPost.mockResolvedValue({ ok: false, error: 'disk full' });
    await expect(enableReticulumSetupHub(bridge, hub)).rejects.toThrow('disk full');
  });
});

describe('guided identity setup', () => {
  it('creates an identity without replacement and returns the one-time recovery words', async () => {
    const bridge = api();
    bridge.proxyGet.mockResolvedValue({ configured: false });
    bridge.proxyPost.mockResolvedValue({ ok: true, mnemonic: 'example recovery words' });
    expect(await saveReticulumSetupIdentity(bridge, '  Newcomer  ')).toEqual({
      mnemonic: 'example recovery words',
    });
    expect(bridge.proxyPost).toHaveBeenCalledExactlyOnceWith('/api/v1/identity/generate', {
      display_name: 'Newcomer',
      replace: false,
    });
  });

  it('reads current identity before saving and only renames an existing identity', async () => {
    const bridge = api();
    bridge.proxyGet.mockResolvedValue({ configured: true });
    expect(await saveReticulumSetupIdentity(bridge, 'New name')).toEqual({ mnemonic: null });
    expect(bridge.proxyPost).toHaveBeenCalledExactlyOnceWith('/api/v1/identity/display-name', {
      display_name: 'New name',
    });
  });

  it('does not generate an identity when the current status is unavailable', async () => {
    const bridge = api();
    bridge.proxyGet.mockResolvedValue({ ok: false });
    await expect(saveReticulumSetupIdentity(bridge, 'Name')).rejects.toThrow(
      'SETUP_IDENTITY_UNAVAILABLE',
    );
    expect(bridge.proxyPost).not.toHaveBeenCalled();
  });

  it('preserves an identity created elsewhere during a generate race', async () => {
    const bridge = api();
    bridge.proxyGet.mockResolvedValue({ configured: false });
    bridge.proxyPost.mockResolvedValue({ ok: false, error: 'identity_already_configured' });
    await expect(saveReticulumSetupIdentity(bridge, 'Name')).rejects.toThrow(
      'identity_already_configured',
    );
    expect(bridge.proxyPost).toHaveBeenCalledTimes(1);
    expect(bridge.proxyPost.mock.calls[0][1].replace).toBe(false);
  });
});

describe('setup readiness', () => {
  it('does not infer network readiness from a listening HTTP server', async () => {
    const bridge = api();
    bridge.proxyGet.mockImplementation((path) =>
      Promise.resolve(
        path === '/api/v1/status'
          ? { status: 'ok', rns_ready: false, lxmf_ready: false }
          : { interfaces: [existing] },
      ),
    );
    const result = await readReticulumSetupSnapshot(bridge);
    expect(result).toMatchObject({ rnsReady: false, messagingReady: false });
    expect(onlineReticulumSetupInterfaces(result)).toEqual([]);
  });

  it('requires enabled, online interfaces instead of a populated saved config', () => {
    const online = { ...existing, enabled: true, status: 'connected' };
    expect(
      onlineReticulumSetupInterfaces({
        rnsReady: true,
        messagingReady: true,
        interfaces: [existing, { ...existing, status: 'up' }, online],
      }),
    ).toEqual([online]);
  });
});
