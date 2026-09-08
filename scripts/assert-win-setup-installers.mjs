#!/usr/bin/env node
/**
 * Fail closed if release/ is missing the split x64 + arm64 NSIS Setup installers.
 * Accepts default and test-build `-run{N}` stamped basenames.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectWinSetupInstallers } from './win-setup-installer-names.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string[]} argv
 * @returns {{ rootDir: string }}
 */
export function parseAssertWinSetupArgs(argv) {
  let rootDir = path.join(ROOT, 'release');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      const next = argv[++i];
      if (!next) throw new Error('--root requires a directory');
      rootDir = path.resolve(next);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { rootDir };
}

/**
 * @param {{ rootDir: string, version?: string, packageJsonPath?: string }} opts
 * @returns {{ x64: string, arm64: string }}
 */
export function assertWinSetupInstallers(opts) {
  const packageJsonPath = opts.packageJsonPath ?? path.join(ROOT, 'package.json');
  const version = opts.version ?? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
  if (typeof version !== 'string' || !version) {
    throw new Error('[assert-win-setup-installers] package.json version is missing');
  }
  if (!fs.existsSync(opts.rootDir)) {
    throw new Error(`[assert-win-setup-installers] missing directory: ${opts.rootDir}`);
  }
  const names = fs.readdirSync(opts.rootDir);
  const found = collectWinSetupInstallers(version, names);
  console.debug(`[assert-win-setup-installers] OK — x64=${found.x64} arm64=${found.arm64}`);
  return found;
}

function main() {
  const { rootDir } = parseAssertWinSetupArgs(process.argv.slice(2));
  assertWinSetupInstallers({ rootDir });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
