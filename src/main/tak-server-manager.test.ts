import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock electron before any imports that use it
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-tak'),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
}));

// Mock the certificate manager to avoid filesystem I/O
vi.mock('./tak/certificate-manager', () => ({
  loadOrGenerateCerts: vi.fn().mockResolvedValue({
    caCert: 'ca-cert-pem',
    caKey: 'ca-key-pem',
    serverCert: 'server-cert-pem',
    serverKey: 'server-key-pem',
    clientCert: 'client-cert-pem',
    clientKey: 'client-key-pem',
  }),
  regenerateCerts: vi.fn().mockResolvedValue({
    caCert: 'ca-cert-pem',
    caKey: 'ca-key-pem',
    serverCert: 'server-cert-pem',
    serverKey: 'server-key-pem',
    clientCert: 'client-cert-pem',
    clientKey: 'client-key-pem',
  }),
  getCertsDir: vi.fn(() => '/tmp/test-tak/tak-certs'),
}));

// Mock fs to avoid actual file writes
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    rmSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
}));

// Mock tls module
const mockSocket = new EventEmitter() as EventEmitter & {
  write: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  remoteAddress: string;
};
mockSocket.write = vi.fn();
mockSocket.destroy = vi.fn();
mockSocket.remoteAddress = '192.168.1.50';

class MockTlsServer extends EventEmitter {
  listen = vi.fn((_port: unknown, cb: () => void) => {
    cb();
    return this;
  });
  close = vi.fn();
}
const mockServer = new MockTlsServer();

vi.mock('tls', () => ({
  default: {
    createServer: vi.fn(() => mockServer),
  },
  createServer: vi.fn(() => mockServer),
}));

import { TakServerManager } from './tak-server-manager';

const DEFAULT_SETTINGS = {
  enabled: true,
  port: 8089,
  serverName: 'mesh-client',
  requireClientCert: false,
};

describe('TakServerManager', () => {
  let manager: TakServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new TakServerManager();
  });

  it('starts with running=false status', () => {
    const status = manager.getStatus();
    expect(status.running).toBe(false);
  });

  it('start() emits status with running=true', async () => {
    const statusEvents: unknown[] = [];
    manager.on('status', (s) => statusEvents.push(s));

    await manager.start(DEFAULT_SETTINGS);

    const lastStatus = statusEvents[statusEvents.length - 1] as { running: boolean };
    expect(lastStatus.running).toBe(true);
  });

  it('stop() after start() emits status with running=false', async () => {
    await manager.start(DEFAULT_SETTINGS);

    const statusEvents: unknown[] = [];
    manager.on('status', (s) => statusEvents.push(s));

    manager.stop();

    const lastStatus = statusEvents[statusEvents.length - 1] as { running: boolean };
    expect(lastStatus.running).toBe(false);
  });

  it('stop() when not running does not throw', () => {
    expect(() => {
      manager.stop();
    }).not.toThrow();
  });

  it('onNodeUpdate() with null lat does not throw', async () => {
    await manager.start(DEFAULT_SETTINGS);
    expect(() => {
      manager.onNodeUpdate({
        node_id: 1,
        latitude: null,
        longitude: null,
        long_name: 'Test',
        short_name: 'T',
        battery: 50,
        last_heard: Date.now(),
        snr: 0,
        hw_model: '',
      });
    }).not.toThrow();
  });

  it('getConnectedClients() returns empty array when no clients', async () => {
    await manager.start(DEFAULT_SETTINGS);
    expect(manager.getConnectedClients()).toEqual([]);
  });

  it('getStatus() reflects current port', async () => {
    await manager.start({ ...DEFAULT_SETTINGS, port: 9999 });
    expect(manager.getStatus().port).toBe(9999);
  });
});
