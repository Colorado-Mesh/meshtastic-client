import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import AdminPanel from './AdminPanel';
import { ToastProvider } from './Toast';

describe('AdminPanel accessibility', () => {
  const defaultProps = {
    nodes: new Map(),
    messageCount: 0,
    channels: [],
    onReboot: vi.fn().mockResolvedValue(undefined),
    onShutdown: vi.fn().mockResolvedValue(undefined),
    onFactoryReset: vi.fn().mockResolvedValue(undefined),
    onResetNodeDb: vi.fn().mockResolvedValue(undefined),
    isConnected: false,
    myNodeNum: null,
    onLocationFilterChange: vi.fn(),
  };

  it('has no axe violations', async () => {
    const { container } = render(
      <ToastProvider>
        <AdminPanel {...defaultProps} />
      </ToastProvider>,
    );
    // Flush async state updates (e.g. getMessageChannels promise)
    await act(async () => {});
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
