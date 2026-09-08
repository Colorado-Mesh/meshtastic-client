import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { mockConsoleWarn } from '@/renderer/lib/vitestConsoleMock';

import MeshcoreChatChannelManager from './MeshcoreChatChannelManager';
import { ToastProvider } from './Toast';

const configuredSecret = new Uint8Array([1, ...new Array<number>(15).fill(0)]);

function renderManager(
  overrides: Partial<React.ComponentProps<typeof MeshcoreChatChannelManager>> = {},
) {
  const props: React.ComponentProps<typeof MeshcoreChatChannelManager> = {
    channels: [{ index: 0, name: '#general', secret: configuredSecret }],
    disabled: false,
    onSetChannel: vi.fn().mockResolvedValue(undefined),
    onSelectChannel: vi.fn(),
    ...overrides,
  };
  render(
    <ToastProvider>
      <MeshcoreChatChannelManager {...props} />
    </ToastProvider>,
  );
  return props;
}

describe('MeshcoreChatChannelManager', () => {
  it('adds a hashtag channel to the first free slot and selects it', async () => {
    const user = userEvent.setup();
    const props = renderManager({
      channels: [
        { index: 0, name: '#general', secret: configuredSecret },
        { index: 2, name: '#alerts', secret: configuredSecret },
      ],
    });

    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.type(screen.getByLabelText('Name'), 'weather');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(props.onSetChannel).toHaveBeenCalledTimes(1);
    });
    const [index, name, secret] = vi.mocked(props.onSetChannel).mock.calls[0];
    expect(index).toBe(1);
    expect(name).toBe('#weather');
    expect(
      Array.from(secret)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    ).toBe('88f502554fee92a1625cfb311546e7cb');
    expect(props.onSelectChannel).toHaveBeenCalledWith(1);
  });

  it('selects an existing exact channel instead of creating a duplicate', async () => {
    const user = userEvent.setup();
    const props = renderManager();

    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.type(screen.getByLabelText('Name'), 'general');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSetChannel).not.toHaveBeenCalled();
    expect(props.onSelectChannel).toHaveBeenCalledWith(0);
  });

  it('adds a private channel with its supplied key and unprefixed name', async () => {
    const user = userEvent.setup();
    const props = renderManager();

    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
    await user.type(screen.getByLabelText('Name'), ' Team ');
    const key = screen.getByLabelText('Key (32 hex chars = 16 bytes)');
    expect(key).toHaveAttribute('type', 'password');
    await user.type(key, ' 0123456789ABCDEF0123456789ABCDEF ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(props.onSetChannel).toHaveBeenCalledWith(
        1,
        'Team',
        new Uint8Array([1, 35, 69, 103, 137, 171, 205, 239, 1, 35, 69, 103, 137, 171, 205, 239]),
      );
    });
    expect(props.onSelectChannel).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['', 'a'.repeat(31), 'a'.repeat(33), 'ag'.repeat(16), '0'.repeat(32)])(
    'rejects an invalid or unset private key (%s)',
    async (keyHex) => {
      const user = userEvent.setup();
      const props = renderManager();
      await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
      await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
      await user.type(screen.getByLabelText('Name'), 'Team');
      if (keyHex) await user.type(screen.getByLabelText('Key (32 hex chars = 16 bytes)'), keyHex);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
      await user.type(screen.getByLabelText('Name'), '{Enter}');
      expect(props.onSetChannel).not.toHaveBeenCalled();
      expect(props.onSelectChannel).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'matches private channels by name and key (same key: %s)',
    async (sameKey) => {
      const user = userEvent.setup();
      const props = renderManager({
        channels: [{ index: 0, name: '#team', secret: new Uint8Array(16).fill(0xaa) }],
      });
      await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
      await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
      await user.type(screen.getByLabelText('Name'), '#team');
      await user.type(
        screen.getByLabelText('Key (32 hex chars = 16 bytes)'),
        (sameKey ? 'aa' : 'bb').repeat(16),
      );
      await user.click(screen.getByRole('button', { name: 'Save' }));

      if (sameKey) {
        expect(props.onSetChannel).not.toHaveBeenCalled();
        expect(props.onSelectChannel).toHaveBeenCalledWith(0);
      } else {
        await waitFor(() => {
          expect(props.onSetChannel).toHaveBeenCalledWith(
            1,
            '#team',
            new Uint8Array(16).fill(0xbb),
          );
        });
        expect(props.onSelectChannel).toHaveBeenCalledWith(1);
      }
    },
  );

  it('requires a private name and accepts the full 31-character name limit', async () => {
    const user = userEvent.setup();
    const props = renderManager();
    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
    await user.type(screen.getByLabelText('Key (32 hex chars = 16 bytes)'), 'aa'.repeat(16));
    await user.type(screen.getByLabelText('Name'), ' ');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'a'.repeat(32));
    expect(screen.getByLabelText('Name')).toHaveValue('a'.repeat(31));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(props.onSetChannel).toHaveBeenCalledWith(
        1,
        'a'.repeat(31),
        new Uint8Array(16).fill(0xaa),
      );
    });
  });

  it('returns to hashtag key derivation when private mode is turned off', async () => {
    const user = userEvent.setup();
    const props = renderManager();
    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    const mode = screen.getByRole('checkbox', { name: 'Private channel (enter key)' });
    await user.click(mode);
    await user.type(screen.getByLabelText('Name'), 'weather');
    await user.type(screen.getByLabelText('Key (32 hex chars = 16 bytes)'), 'aa'.repeat(16));
    await user.click(mode);
    expect(screen.queryByLabelText('Key (32 hex chars = 16 bytes)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(props.onSetChannel).toHaveBeenCalledWith(1, '#weather', expect.any(Uint8Array));
    });
    expect(vi.mocked(props.onSetChannel).mock.calls[0][2]).not.toEqual(
      new Uint8Array(16).fill(0xaa),
    );
  });

  it('does not overwrite a channel when all slots are occupied', async () => {
    const user = userEvent.setup();
    const props = renderManager({
      channels: Array.from({ length: 40 }, (_, index) => ({
        index,
        name: `#channel-${index}`,
        secret: configuredSecret,
      })),
    });
    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
    await user.type(screen.getByLabelText('Name'), 'Team');
    await user.type(screen.getByLabelText('Key (32 hex chars = 16 bytes)'), 'aa'.repeat(16));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSetChannel).not.toHaveBeenCalled();
    expect(props.onSelectChannel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clears the private key when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
    await user.type(screen.getByLabelText('Key (32 hex chars = 16 bytes)'), 'aa'.repeat(16));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
    expect(screen.getByLabelText('Key (32 hex chars = 16 bytes)')).toHaveValue('');
  });

  it('keeps the private channel available for retry after a failed save', async () => {
    const warn = mockConsoleWarn();
    const user = userEvent.setup();
    const props = renderManager({
      onSetChannel: vi
        .fn()
        .mockRejectedValueOnce(new Error('Radio disconnected'))
        .mockResolvedValue(undefined),
    });
    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    await user.click(screen.getByRole('checkbox', { name: 'Private channel (enter key)' }));
    await user.type(screen.getByLabelText('Name'), 'Team');
    await user.type(screen.getByLabelText('Key (32 hex chars = 16 bytes)'), 'aa'.repeat(16));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Failed: Radio disconnected')).toBeInTheDocument();
    expect(props.onSelectChannel).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Key (32 hex chars = 16 bytes)')).toHaveValue('aa'.repeat(16));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(props.onSelectChannel).toHaveBeenCalledWith(1);
    });
    warn.restore();
  });

  it('does not open while device channel management is disabled', async () => {
    const user = userEvent.setup();
    renderManager({ disabled: true });
    const add = screen.getByRole('button', { name: '+ Add Channel' });
    expect(add).toBeDisabled();
    await user.click(add);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape without changing the underlying chat view', async () => {
    const user = userEvent.setup();
    const underlyingKeyHandler = vi.fn();
    renderManager();

    await user.click(screen.getByRole('button', { name: '+ Add Channel' }));
    document.addEventListener('keydown', underlyingKeyHandler);
    await user.keyboard('{Escape}');
    document.removeEventListener('keydown', underlyingKeyHandler);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(underlyingKeyHandler).not.toHaveBeenCalled();
  });
});
