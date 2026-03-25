// @vitest-environment node
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const README = readFileSync(join(__dirname, '../../README.md'), 'utf-8');
const DEV_ENV_DOC = readFileSync(join(__dirname, '../../docs/development-environment.md'), 'utf-8');
const NOBLE_MANAGER = readFileSync(join(__dirname, 'noble-ble-manager.ts'), 'utf-8');

describe('Linux BLE guidance contracts (regression)', () => {
  it('documents setpriv as the preferred npm start flow', () => {
    expect(DEV_ENV_DOC).toContain('--ambient-caps +net_raw');
    expect(DEV_ENV_DOC).toContain("bash -lc 'npm start'");
  });

  it('documents release guidance for extracted binaries and AppImage limitations', () => {
    expect(README).toContain('docs/development-environment.md#linux-bluetooth-ble-permissions');
    expect(DEV_ENV_DOC).toContain('If you reinstall dependencies (`npm install`/`npm ci`)');
  });

  it('keeps runtime capability error wording aligned with release guidance', () => {
    expect(NOBLE_MANAGER).toContain('Preferred for npm start: run with ambient capability');
    expect(NOBLE_MANAGER).toContain('sudo setpriv --reuid=$USER --regid=$(id -g)');
    expect(NOBLE_MANAGER).toContain('sudo setcap -r ./node_modules/electron/dist/electron');
    expect(NOBLE_MANAGER).toContain('For release builds, run setcap on the extracted executable');
    expect(NOBLE_MANAGER).toContain('not the .AppImage wrapper');
  });

  it('retains Fedora fallback instructions for ambient-cap launch', () => {
    expect(DEV_ENV_DOC).toContain('--ambient-caps +net_raw');
    expect(DEV_ENV_DOC).toContain('Linux Bluetooth (BLE) Permissions');
  });

  it('documents display-preserving setpriv launch hint for desktop sessions', () => {
    expect(DEV_ENV_DOC).toContain('XAUTHORITY=$XAUTHORITY');
    expect(DEV_ENV_DOC).toContain(
      'sudo setpriv --reuid=$USER --regid=$(id -g) --init-groups --inh-caps +net_raw --ambient-caps +net_raw --reset-env',
    );
    expect(DEV_ENV_DOC).toContain(
      'bash -lc "export DISPLAY=$DISPLAY; export XAUTHORITY=$XAUTHORITY; npm start"',
    );
  });
});
