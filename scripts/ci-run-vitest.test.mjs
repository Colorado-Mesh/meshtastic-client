// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  buildCiVitestArgs,
  normalizeRelatedPathForVitest,
  parseRelatedPaths,
  runCiVitest,
} from './ci-run-vitest.mjs';

describe('ci-run-vitest', () => {
  it('builds a coverage shard for a full run', () => {
    expect(buildCiVitestArgs({ mode: 'full', project: 'main' })).toEqual([
      'run',
      '--coverage',
      '--coverage.clean=false',
      '--project',
      'main',
      '--reporter=blob',
      '--outputFile.blob=.vitest-reports/blob-main.json',
      '--passWithNoTests',
    ]);
  });

  it.each(['full', 'related'])('shards %s runs without colliding blob reports', (mode) => {
    const outputs = [1, 2, 3].map((index) => {
      const args = buildCiVitestArgs({
        mode,
        project: 'renderer-ui',
        shard: `${index}/3`,
        relatedPaths: ['src/renderer/App.tsx'],
      });
      expect(args).toContain(`--shard=${index}/3`);
      expect(args.includes('--coverage')).toBe(mode === 'full');
      if (mode === 'related') expect(args).toContain('src/renderer/App.tsx');
      return args.find((arg) => arg.startsWith('--outputFile.blob='));
    });
    expect(new Set(outputs).size).toBe(3);
    expect(outputs[0]).toBe('--outputFile.blob=.vitest-reports/blob-renderer-ui-1-3.json');
  });

  it.each(['0/3', '4/3', '1/0', '-1/3', '1.5/3', '1/3/4', 'invalid', '1/9007199254740992'])(
    'rejects invalid shard %s before invoking Vitest',
    (shard) => {
      const runVitestArgvFn = vi.fn();
      expect(() =>
        runCiVitest({ mode: 'full', project: 'main', shard }, { runVitestArgvFn }),
      ).toThrow('Invalid Vitest shard');
      expect(runVitestArgvFn).not.toHaveBeenCalled();
    },
  );

  it('propagates a failing shard exit code', () => {
    expect(
      runCiVitest(
        { mode: 'full', project: 'renderer-ui', shard: '2/3' },
        { runVitestArgvFn: () => 1 },
      ),
    ).toBe(1);
  });

  it('passes related paths as literal argv entries', () => {
    const relatedPath = 'src/main/a file & more.ts';
    const runVitestArgvFn = vi.fn(() => 0);
    expect(
      runCiVitest(
        { mode: 'related', project: 'main', relatedPaths: [relatedPath] },
        { cwd: '/repo', runVitestArgvFn },
      ),
    ).toBe(0);
    expect(runVitestArgvFn).toHaveBeenCalledWith(
      [
        'related',
        '--run',
        '--project',
        'main',
        '--reporter=blob',
        '--outputFile.blob=.vitest-reports/blob-main.json',
        '--passWithNoTests',
        relatedPath,
      ],
      expect.objectContaining({ cwd: '/repo' }),
    );
  });

  it('validates related-path JSON', () => {
    expect(parseRelatedPaths('["src/main/database.ts"]')).toEqual(['src/main/database.ts']);
    expect(() => parseRelatedPaths('{"path":"src/main/database.ts"}')).toThrow(
      'VITEST_PATHS_JSON must be a JSON array of strings',
    );
    expect(() => parseRelatedPaths('[1]')).toThrow(
      'VITEST_PATHS_JSON must be a JSON array of strings',
    );
  });

  it('normalizes option-like relative paths before passing them to Vitest', () => {
    expect(normalizeRelatedPathForVitest('-dangerous.test.ts')).toBe('./-dangerous.test.ts');
    expect(normalizeRelatedPathForVitest('src/main/database.ts')).toBe('src/main/database.ts');
    expect(
      buildCiVitestArgs({
        mode: 'related',
        project: 'main',
        relatedPaths: ['-dangerous.test.ts'],
      }),
    ).toContain('./-dangerous.test.ts');
  });

  it('rejects unknown projects and empty related selections', () => {
    expect(() => buildCiVitestArgs({ mode: 'full', project: 'unknown' })).toThrow(
      'Unknown Vitest project',
    );
    expect(() => buildCiVitestArgs({ mode: 'related', project: 'main', relatedPaths: [] })).toThrow(
      'Invalid Vitest CI selection',
    );
  });
});
