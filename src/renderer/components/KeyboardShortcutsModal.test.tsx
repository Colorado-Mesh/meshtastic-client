import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import KeyboardShortcutsModal from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(<KeyboardShortcutsModal onClose={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
