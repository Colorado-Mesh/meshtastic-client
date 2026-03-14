/**
 * Tests for log sanitization (log injection prevention).
 * See CONTRIBUTING.md § Log injection (CodeQL js/log-injection). When changing
 * the log pipeline or sanitizeLogMessage/sanitizeForLogSink, ensure these tests
 * still pass so regressions are caught by the suite (including pre-commit).
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { sanitizeForLogSink, sanitizeLogMessage } from '@/main/sanitize-log-message';

describe('sanitizeLogMessage', () => {
  it('strips newlines and keeps output on one line', () => {
    expect(sanitizeLogMessage('a\nb')).toBe('a b');
    expect(sanitizeLogMessage('a\r\nb')).toBe('a b');
    expect(sanitizeLogMessage('line1\n[INFO] forged\nline2')).toBe('line1 [INFO] forged line2');
  });

  it('strips other control characters', () => {
    expect(sanitizeLogMessage('a\x00b')).toBe('a b');
    expect(sanitizeLogMessage('a\tb')).toBe('a b');
    expect(sanitizeLogMessage('a\u2028b')).toBe('a b');
  });

  it('normalizes multiple spaces to one', () => {
    expect(sanitizeLogMessage('a   b')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeLogMessage('  x  ')).toBe('x');
  });

  it('handles non-strings by stringifying', () => {
    expect(sanitizeLogMessage(123)).toBe('123');
    expect(sanitizeLogMessage(null)).toBe('null');
  });
});

describe('sanitizeForLogSink (console path, CodeQL pattern)', () => {
  it('strips newlines and keeps output on one line', () => {
    expect(sanitizeForLogSink('a\nb')).toBe('a b');
    expect(sanitizeForLogSink('a\r\nb')).toBe('a b');
    expect(sanitizeForLogSink('line1\n[INFO] forged\nline2')).toBe('line1 [INFO] forged line2');
  });

  it('strips other control characters', () => {
    expect(sanitizeForLogSink('a\x00b')).toBe('a b');
    expect(sanitizeForLogSink('a\tb')).toBe('a b');
    expect(sanitizeForLogSink('a\u2028b')).toBe('a b');
  });

  it('normalizes multiple spaces and trims', () => {
    expect(sanitizeForLogSink('a   b')).toBe('a b');
    expect(sanitizeForLogSink('  x  ')).toBe('x');
  });

  it('matches sanitizeLogMessage for string input (same effective behavior)', () => {
    const inputs = ['a\nb', 'x\ry', 'line1\n[FAKE]\nline2', '  spaces  ', 'a\x00b'];
    for (const s of inputs) {
      expect(sanitizeForLogSink(s)).toBe(sanitizeLogMessage(s));
    }
  });
});

describe('log-injection check (main process)', () => {
  it('main process has no unsanitized console.*(..., err|e|error|reason) calls', () => {
    const projectRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..', '..');
    execFileSync('node', [path.join(projectRoot, 'scripts', 'check-log-injection.mjs')], {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: projectRoot,
    });
  });
});
