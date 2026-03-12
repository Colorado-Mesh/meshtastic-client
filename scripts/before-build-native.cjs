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
 * Fallbacks on Windows after EPERM/EBUSY: rename build → build.stale.<time> so
 * node-gyp can create a fresh build dir; if still blocked, do one last rmSync
 * attempt with the same options. Last resort: dist with npmRebuild disabled
 * (package.json dist:win:skip-rebuild).
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
 * When rmSync fails with EPERM, the whole tree may still be locked. Renaming the
 * directory often succeeds when delete does not; node-gyp then creates a fresh
 * `build` folder alongside the stale one.
 */
function tryRenameStaleBuild(buildDir) {
  const stale = `${buildDir}.stale.${Date.now()}`;
  try {
    fs.renameSync(buildDir, stale);
    return true;
  } catch {
    return false;
  }
}

/**
 * Final attempt to remove a locked build tree using Node's fs APIs only.
 */
function tryRdSlashQ(buildDir) {
  try {
    if (fs.existsSync(buildDir)) {
      const opts = { recursive: true, force: true, maxRetries: 3, retryDelay: 200 };
      try {
        fs.rmSync(buildDir, opts);
      } catch (e) {
        // Node without maxRetries on rmSync throws; EPERM should propagate
        if (e && (e.code === "EPERM" || e.code === "EBUSY")) throw e;
        fs.rmSync(buildDir, { recursive: true, force: true });
      }
    }
    return fs.existsSync(buildDir) === false;
  } catch {
    return false;
  }
}

function isLockError(err) {
  return err && (err.code === "EPERM" || err.code === "EBUSY");
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
      if (isLockError(err) && tryRenameStaleBuild(buildDir)) {
        console.warn(
          "[before-build-native] better-sqlite3/build was locked; renamed aside so rebuild can use a fresh folder.",
          "You can delete",
          buildDir + ".stale.*",
          "later if desired.",
        );
        return true;
      }
      if (isLockError(err) && tryRdSlashQ(buildDir)) {
        console.warn(
          "[before-build-native] better-sqlite3/build removed via rd /s /q after rmSync failed (locked).",
        );
        return true;
      }
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
