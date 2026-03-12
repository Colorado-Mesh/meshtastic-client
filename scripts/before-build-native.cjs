/**
 * electron-builder beforeBuild hook.
 *
 * electron-builder runs @electron/rebuild again during dist; node-gyp then tries
 * to replace better_sqlite3.node. On Windows, EPERM unlink often happens when
 * the file is still mapped (Defender scan, stray node.exe) or when replacing
 * in-place is flaky. Removing the whole build tree first lets the rebuild
 * compile into an empty Release folder instead of unlinking a locked binary.
 *
 * Failure point: rmSync can still throw EPERM if something holds the DLL.
 * Fallback: run dist with npmRebuild disabled after a successful npm install
 * (see package.json dist:win:skip-rebuild and README).
 */
const fs = require("fs");
const path = require("path");

const RETRIES = 5;
const DELAY_MS = 800;

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin; avoids setTimeout sync dependency in older Node */
  }
}

function rmWithRetries(dir) {
  for (let i = 0; i < RETRIES; i++) {
    try {
      if (fs.existsSync(dir)) {
        const opts = { recursive: true, force: true, maxRetries: 3, retryDelay: 200 };
        try {
          fs.rmSync(dir, opts);
        } catch (e) {
          // Node without maxRetries on rmSync throws; EPERM should propagate
          if (e && (e.code === "EPERM" || e.code === "EBUSY")) throw e;
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
      return;
    } catch (e) {
      if (i === RETRIES - 1) throw e;
      sleep(DELAY_MS);
    }
  }
}

/**
 * @param {{ appDir: string }} context
 * @returns {Promise<boolean>} true = let electron-builder run install/rebuild
 */
module.exports = async function beforeBuildNative(context) {
  const appDir = context.appDir || process.cwd();
  const buildDir = path.join(appDir, "node_modules", "better-sqlite3", "build");
  if (process.platform === "win32" && fs.existsSync(buildDir)) {
    try {
      rmWithRetries(buildDir);
    } catch (err) {
      console.warn(
        "[before-build-native] Could not remove better-sqlite3/build (file may be locked).",
        err && err.message ? err.message : err,
      );
      console.warn(
        "[before-build-native] Close Electron/Node processes and retry, or run: npm run dist:win:skip-rebuild",
      );
      throw err;
    }
  }
  return true;
};
