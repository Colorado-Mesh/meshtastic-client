import { describe, expect, it } from 'vitest';

import { lightMarkdownToMicron, rrcBodyLooksFormatted } from './rrcFormattedBody';

describe('rrcFormattedBody', () => {
  it('detects micron and markdown cues', () => {
    expect(rrcBodyLooksFormatted('plain hello')).toBe(false);
    expect(rrcBodyLooksFormatted('`!Bold`!')).toBe(true);
    expect(rrcBodyLooksFormatted('**bold**')).toBe(true);
    expect(rrcBodyLooksFormatted('[x](https://example.com)')).toBe(true);
  });

  it('maps light markdown to micron controls', () => {
    expect(lightMarkdownToMicron('**Hi**')).toContain('`!Hi`!');
    expect(lightMarkdownToMicron('*Hi*')).toContain('`*Hi`*');
    expect(lightMarkdownToMicron('[Docs](https://example.com)')).toBe(
      '`[Docs`https://example.com`]',
    );
  });

  it('routes markdown bodies through micron conversion before render', () => {
    // Full HTML render needs jsdom (MicronParser); this asserts the preprocess path.
    expect(rrcBodyLooksFormatted('see **bold**')).toBe(true);
    expect(lightMarkdownToMicron('see **bold**')).toContain('`!bold`!');
  });
});
