import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { enrichMeshCoreSelfInfo } from '../lib/meshcoreTelemetryPrivacy';
import MeshcoreContactSettingsSection from './MeshcoreContactSettingsSection';
import { ToastProvider } from './Toast';

function renderWithToast(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function minimalSelfInfo(manualAddContacts: boolean) {
  return enrichMeshCoreSelfInfo({
    name: 'Test',
    publicKey: new Uint8Array(32).fill(0xab),
    type: 0,
    txPower: 10,
    advLat: 0,
    advLon: 0,
    radioFreq: 900_000_000,
    manualAddContacts,
  });
}

describe('MeshcoreContactSettingsSection', () => {
  it('invokes onApply with autoAddAll false after switching to Auto add selected', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    renderWithToast(
      <MeshcoreContactSettingsSection
        selfInfo={minimalSelfInfo(false)}
        autoadd={{ autoaddConfig: 0, autoaddMaxHops: 0 }}
        disabled={false}
        applying={false}
        meshcoreContactsShowPublicKeys={false}
        onMeshcoreContactsShowPublicKeysChange={vi.fn()}
        meshcoreContactsShowRefreshControl={false}
        onMeshcoreContactsShowRefreshControlChange={vi.fn()}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByText('Contact management'));
    await user.click(screen.getByRole('radio', { name: /Auto add selected/i }));

    const applyBtn = screen.getByRole('button', { name: 'Apply contact management' });
    expect(applyBtn).not.toBeDisabled();
    await user.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({
      autoAddAll: false,
      maxHopsWire: 0,
    });
  });

  it('calls onClearAllContacts after confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClearAllContacts = vi.fn().mockResolvedValue(undefined);

    renderWithToast(
      <MeshcoreContactSettingsSection
        selfInfo={minimalSelfInfo(false)}
        autoadd={{ autoaddConfig: 0, autoaddMaxHops: 0 }}
        disabled={false}
        applying={false}
        meshcoreContactsShowPublicKeys={false}
        onMeshcoreContactsShowPublicKeysChange={vi.fn()}
        meshcoreContactsShowRefreshControl={false}
        onMeshcoreContactsShowRefreshControlChange={vi.fn()}
        onApply={vi.fn().mockResolvedValue(undefined)}
        onClearAllContacts={onClearAllContacts}
      />,
    );

    await user.click(screen.getByText('Contact management'));
    await user.click(screen.getByRole('button', { name: 'Clear all MeshCore contacts' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(onClearAllContacts).toHaveBeenCalledTimes(1);
    });
    confirmSpy.mockRestore();
  });
});
