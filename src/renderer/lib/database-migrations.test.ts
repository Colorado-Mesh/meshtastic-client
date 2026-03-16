/**
 * Tests for database migration hygiene (pre-commit / CI guards).
 *
 * These tests catch two CodeQL patterns that were introduced during the v14
 * migration and filed as PR review comments:
 *
 *  1. js/missing-space-in-string-concatenation — SQL segments ending with a
 *     bare comma ('col TEXT,') produce 'col TEXT,nextCol' when concatenated.
 *     Every segment must carry a trailing space: 'col TEXT, '.
 *
 *  2. js/useless-assignment-to-local — after the last migration block stamps
 *     `db.pragma('user_version = N')`, a follow-up `userVersion = N` is dead
 *     code because no later guard reads the variable.
 *
 * See scripts/check-db-migrations.mjs for the implementation.
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('database migration source checks (CodeQL)', () => {
  const projectRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..', '..');
  const script = path.join(projectRoot, 'scripts', 'check-db-migrations.mjs');

  it('SQL string segments have spaces after commas (js/missing-space-in-string-concatenation)', () => {
    expect(() =>
      execFileSync('node', [script], { encoding: 'utf8', stdio: 'pipe', cwd: projectRoot }),
    ).not.toThrow();
  });

  it('last migration block has no useless userVersion assignment (js/useless-assignment-to-local)', () => {
    // The script checks both rules; a throw here means either one fired.
    // A dedicated message is printed to stderr by the script for each rule.
    expect(() =>
      execFileSync('node', [script], { encoding: 'utf8', stdio: 'pipe', cwd: projectRoot }),
    ).not.toThrow();
  });
});
