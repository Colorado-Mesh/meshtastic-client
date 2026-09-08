#!/usr/bin/env node
/**
 * Prefer the real pnpm.exe on Windows PATH after pnpm/action-setup.
 *
 * Failure point: action-setup v6.1.0 native bootstrap (pnpm 12) sets PNPM_HOME to
 * `node_modules/.bin`. PowerShell resolves `pnpm` to npm's `pnpm.ps1` shim there,
 * which exits 0 with no stdout — so `pnpm install` / `pnpm run dist:win` become
 * silent no-ops and Windows packaging uploads only READ-ME-FIRST.
 *
 * Fallback: the native package binary lives at `node_modules/pnpm/pnpm.exe`.
 * Prepend that directory to GITHUB_PATH so subsequent steps find pnpm.exe before
 * the broken .ps1. Self-update layouts may place pnpm.exe under PNPM_HOME or
 * PNPM_HOME/bin instead.
 *
 * No-op on non-Windows. Requires PNPM_HOME + GITHUB_PATH (GitHub Actions).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} pnpmHome
 * @returns {string[]}
 */
export function windowsPnpmExeCandidates(pnpmHome) {
  return [
    path.resolve(pnpmHome, '..', 'pnpm', 'pnpm.exe'),
    path.join(pnpmHome, 'pnpm.exe'),
    path.join(pnpmHome, 'bin', 'pnpm.exe'),
  ];
}

/**
 * @param {{
 *   platform?: NodeJS.Platform
 *   pnpmHome?: string
 *   githubPath?: string
 *   existsSync?: (p: string) => boolean
 *   appendFileSync?: (p: string, data: string) => void
 *   log?: (msg: string) => void
 * }} [opts]
 * @returns {{ skipped: boolean, exeDir?: string, exe?: string, reason?: string }}
 */
export function preferWindowsPnpmExe(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const log = opts.log ?? ((msg) => console.debug(msg));
  if (platform !== 'win32') {
    return { skipped: true, reason: 'not-win32' };
  }

  const pnpmHome = opts.pnpmHome ?? process.env.PNPM_HOME;
  if (!pnpmHome || !String(pnpmHome).trim()) {
    throw new Error('[ci-prefer-windows-pnpm-exe] PNPM_HOME is unset');
  }

  const githubPath = opts.githubPath ?? process.env.GITHUB_PATH;
  if (!githubPath || !String(githubPath).trim()) {
    throw new Error(
      '[ci-prefer-windows-pnpm-exe] GITHUB_PATH is unset (expected on GitHub Actions runners)',
    );
  }

  const existsSync = opts.existsSync ?? fs.existsSync;
  const appendFileSync = opts.appendFileSync ?? fs.appendFileSync;
  const candidates = windowsPnpmExeCandidates(pnpmHome);
  const exe = candidates.find((p) => existsSync(p));
  if (!exe) {
    throw new Error(
      `[ci-prefer-windows-pnpm-exe] pnpm.exe not found. Tried:\n${candidates
        .map((c) => `  ${c}`)
        .join('\n')}`,
    );
  }

  const exeDir = path.dirname(exe);
  appendFileSync(githubPath, `${exeDir}\n`);
  log(`[ci-prefer-windows-pnpm-exe] prepended ${exeDir} (${exe})`);
  return { skipped: false, exeDir, exe };
}

function main() {
  const result = preferWindowsPnpmExe();
  if (result.skipped) {
    console.debug(`[ci-prefer-windows-pnpm-exe] skip (${result.reason ?? 'unknown'})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
