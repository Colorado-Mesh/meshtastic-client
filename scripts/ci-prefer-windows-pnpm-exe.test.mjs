// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { preferWindowsPnpmExe, windowsPnpmExeCandidates } from './ci-prefer-windows-pnpm-exe.mjs';
import { parsePnpmVersionOutput, verifyPnpmVersion } from './ci-verify-pnpm.mjs';
import { assertWinSetupInstallers } from './assert-win-setup-installers.mjs';

/** @type {string[]} */
const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ci-prefer-windows-pnpm-exe', () => {
  it('lists native bootstrap, PNPM_HOME, and self-update candidates', () => {
    const home = path.join('C:', 'setup-pnpm', 'node_modules', '.bin');
    expect(windowsPnpmExeCandidates(home)).toEqual([
      path.resolve(home, '..', 'pnpm', 'pnpm.exe'),
      path.join(home, 'pnpm.exe'),
      path.join(home, 'bin', 'pnpm.exe'),
    ]);
  });

  it('skips on non-Windows', () => {
    const result = preferWindowsPnpmExe({
      platform: 'darwin',
      pnpmHome: '/tmp/pnpm',
      githubPath: '/tmp/github_path',
    });
    expect(result).toEqual({ skipped: true, reason: 'not-win32' });
  });

  it('prepends the native package directory when pnpm.exe is beside .bin', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-pnpm-path-'));
    tempDirs.push(root);
    const bin = path.join(root, 'node_modules', '.bin');
    const pkg = path.join(root, 'node_modules', 'pnpm');
    fs.mkdirSync(bin, { recursive: true });
    fs.mkdirSync(pkg, { recursive: true });
    const exe = path.join(pkg, 'pnpm.exe');
    fs.writeFileSync(exe, '');
    const githubPath = path.join(root, 'github_path');
    fs.writeFileSync(githubPath, '');

    /** @type {string[]} */
    const logs = [];
    const result = preferWindowsPnpmExe({
      platform: 'win32',
      pnpmHome: bin,
      githubPath,
      log: (msg) => logs.push(msg),
    });

    expect(result.skipped).toBe(false);
    expect(result.exeDir).toBe(pkg);
    expect(fs.readFileSync(githubPath, 'utf8')).toBe(`${pkg}\n`);
    expect(logs[0]).toContain(pkg);
  });

  it('fails when pnpm.exe is missing', () => {
    expect(() =>
      preferWindowsPnpmExe({
        platform: 'win32',
        pnpmHome: path.join('C:', 'missing', '.bin'),
        githubPath: path.join('C:', 'github_path'),
        existsSync: () => false,
        appendFileSync: () => {},
      }),
    ).toThrow(/pnpm\.exe not found/);
  });
});

describe('ci-verify-pnpm', () => {
  it('parses plain semver stdout', () => {
    expect(parsePnpmVersionOutput('12.3.4\n')).toBe('12.3.4');
    expect(parsePnpmVersionOutput('')).toBeNull();
    expect(parsePnpmVersionOutput('not-a-version')).toBeNull();
  });

  it('accepts matching major and rejects empty or wrong-major output', () => {
    const packageJsonPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-verify-pnpm-')),
      'package.json',
    );
    tempDirs.push(path.dirname(packageJsonPath));
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({ packageManager: 'pnpm@12.3.4+sha512.deadbeef' }),
    );

    expect(
      verifyPnpmVersion({
        packageJsonPath,
        spawnSyncFn: () => ({ status: 0, stdout: '12.9.0\n', stderr: '', error: undefined }),
        log: () => {},
      }),
    ).toBe('12.9.0');

    expect(() =>
      verifyPnpmVersion({
        packageJsonPath,
        spawnSyncFn: () => ({ status: 0, stdout: '', stderr: '', error: undefined }),
        log: () => {},
      }),
    ).toThrow(/did not return semver/);

    expect(() =>
      verifyPnpmVersion({
        packageJsonPath,
        spawnSyncFn: () => ({ status: 0, stdout: '11.25.0\n', stderr: '', error: undefined }),
        log: () => {},
      }),
    ).toThrow(/major mismatch/);
  });
});

describe('assert-win-setup-installers', () => {
  it('accepts stamped split installers and rejects README-only release dirs', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-assert-win-'));
    tempDirs.push(root);
    const packageJsonPath = path.join(root, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '5.35.0' }));
    const releaseDir = path.join(root, 'release');
    fs.mkdirSync(releaseDir);
    fs.writeFileSync(path.join(releaseDir, 'READ-ME-FIRST-test-build.md'), 'x');

    expect(() => assertWinSetupInstallers({ rootDir: releaseDir, packageJsonPath })).toThrow(
      /Expected exactly one x64 NSIS installer/,
    );

    fs.writeFileSync(path.join(releaseDir, 'Mesh-client Setup 5.35.0-run281.exe'), '');
    fs.writeFileSync(path.join(releaseDir, 'Mesh-client Setup 5.35.0-run281-arm64.exe'), '');
    expect(assertWinSetupInstallers({ rootDir: releaseDir, packageJsonPath })).toEqual({
      x64: 'Mesh-client Setup 5.35.0-run281.exe',
      arm64: 'Mesh-client Setup 5.35.0-run281-arm64.exe',
    });
  });
});
