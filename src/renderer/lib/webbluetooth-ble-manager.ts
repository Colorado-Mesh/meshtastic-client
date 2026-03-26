import type { Types } from '@meshtastic/core';

import type { NobleBleSessionId } from './types';

// Error types for Web Bluetooth GATT operations on Linux
export type WebBluetoothErrorType =
  | 'connection_failed'
  | 'service_not_found'
  | 'characteristic_not_found'
  | 'notification_setup_failed'
  | 'pairing_failed';

// BlueZ error patterns that indicate pairing/authentication issues on Linux
const BLUEZ_PAIRING_ERROR_RE =
  /le-connection-abort-by-local|auth failed|connection rejected|pin failed|authentication failed/i;

// Chrome DOMException names that often indicate pairing issues on Linux
const CHROME_PAIRING_ERROR_NAMES = ['SecurityError', 'NetworkError'];

export function isWebBluetoothPairingError(err: unknown): boolean {
  if (err instanceof DOMException) {
    if (CHROME_PAIRING_ERROR_NAMES.includes(err.name)) {
      return true;
    }
    if (BLUEZ_PAIRING_ERROR_RE.test(err.message)) {
      return true;
    }
  }
  if (err instanceof Error) {
    if (err.message.includes('GATT Error: Not supported')) {
      return true;
    }
    if (BLUEZ_PAIRING_ERROR_RE.test(err.message)) {
      return true;
    }
  }
  return false;
}

export class WebBluetoothManager {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private toRadioCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private fromRadioCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private fromRadioNotifyHandler: ((event: Event) => void) | null = null;
  private _fromDeviceController: ReadableStreamDefaultController<Types.DeviceOutput> | null = null;
  private fromRadioUnsub: (() => void) | null = null;
  private connectStartedAtMs: number | null = null;
  private sessionId: NobleBleSessionId;

  public readonly toDevice: WritableStream<Uint8Array>;
  public readonly fromDevice: ReadableStream<Types.DeviceOutput>;

  constructor(sessionId: NobleBleSessionId) {
    this.sessionId = sessionId;

    this.fromDevice = new ReadableStream<Types.DeviceOutput>({
      start: (controller) => {
        this._fromDeviceController = controller;
      },
      cancel: () => {
        this.cleanup();
      },
    });

    this.toDevice = new WritableStream<Uint8Array>({
      write: async (chunk) => {
        console.debug('[WebBluetoothManager] toRadio bytes', chunk.length);
        await this.writeToRadio(chunk);
      },
      close: () => {
        this.cleanup();
      },
    });
  }

  async requestDevice(): Promise<BluetoothDevice> {
    const isMeshcore = this.sessionId === 'meshcore';
    const serviceUuid = isMeshcore
      ? '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
      : '6ba1b218-15a8-461f-9fa8-5dcae273eafd';

    console.debug(`[WebBluetooth:${this.sessionId}] requestDevice for service ${serviceUuid}`);

    if (!navigator.bluetooth) {
      console.error('[WebBluetooth] navigator.bluetooth is UNDEFINED!');
      throw new Error(
        'Web Bluetooth is not available. Ensure you are using a Chromium-based browser with Web Bluetooth enabled. Check chrome://flags for "Experimental Web Platform Features".',
      );
    }

    console.debug('[WebBluetooth] navigator.bluetooth available, checking getAvailability...');
    try {
      const availability = await navigator.bluetooth.getAvailability();
      console.debug('[WebBluetooth] getAvailability:', availability);
      if (!availability) {
        throw new Error(
          'No Bluetooth adapters available. Make sure Bluetooth is enabled on your system.',
        );
      }
    } catch (err) {
      console.debug('[WebBluetooth] getAvailability failed (expected on some platforms):', err);
    }

    console.debug(`[WebBluetooth:${this.sessionId}] calling navigator.bluetooth.requestDevice...`);
    try {
      // Only filter by the service UUID for the current mode
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [serviceUuid] }],
      });
      console.debug('[WebBluetooth] requestDevice succeeded');
    } catch (err) {
      const domErr = err as DOMException;
      const errName = domErr?.name ?? 'unknown';
      const errMessage = domErr?.message ?? String(err);

      console.error(
        `[WebBluetooth:${this.sessionId}] requestDevice EXCEPTION:`,
        err,
        'name:',
        errName,
        'message:',
        errMessage,
      );

      // Distinguish between user cancellation and "no devices found"
      // On Linux, "no devices found" often shows as NotFoundError with "User cancelled" message
      if (errName === 'NotFoundError') {
        if (errMessage.includes('No devices')) {
          throw new Error(
            `No BLE devices found with Meshtastic or Meshcore services. Make sure your device is powered on and nearby.`,
          );
        }
        // Otherwise re-throw the original error
      }
      throw err;
    }

    console.debug(
      `[WebBluetooth:${this.sessionId}] device selected: ${this.device.id} (${this.device.name ?? 'unnamed'})`,
    );

    this.connectStartedAtMs = Date.now();

    this.device.addEventListener('gattserverdisconnected', () => {
      console.debug(`[WebBluetooth:${this.sessionId}] device disconnected`);
      this.cleanup();
    });

    return this.device;
  }

  async connect(): Promise<void> {
    if (!this.device) {
      throw new Error('No device selected. Call requestDevice() first.');
    }

    const isMeshcore = this.sessionId === 'meshcore';
    const serviceUuid = isMeshcore
      ? '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
      : '6ba1b218-15a8-461f-9fa8-5dcae273eafd';

    // Wrap all GATT operations to classify errors for better user guidance
    try {
      this.server = await this.device.gatt!.connect();
      console.debug(`[WebBluetooth:${this.sessionId}] gatt connected`);
    } catch (err) {
      const domErr = err as DOMException;
      const isPairing = isWebBluetoothPairingError(err);
      console.debug(
        `[WebBluetooth:${this.sessionId}] gatt.connect() failed:`,
        domErr?.name,
        domErr?.message,
        isPairing ? '(pairing-related)' : '',
      );
      console.debug('[WebBluetooth] raw error:', err);
      // Wrap the error with classification info for the UI layer
      const error = new Error(
        `Bluetooth connection failed${isPairing ? ' (pairing issue)' : ''}: ${domErr?.message ?? String(err)}`,
      ) as Error & { isPairingRelated?: boolean };
      error.isPairingRelated = isPairing;
      throw error;
    }

    try {
      const service = await this.server.getPrimaryService(serviceUuid);

      if (isMeshcore) {
        const rxUuid = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
        const txUuid = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

        this.toRadioCharacteristic = await service.getCharacteristic(rxUuid);
        this.fromRadioCharacteristic = await service.getCharacteristic(txUuid);
      } else {
        const toRadioUuid = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
        const fromRadioUuid = '2c55e69e-4993-11ed-b878-0242ac120002';

        this.toRadioCharacteristic = await service.getCharacteristic(toRadioUuid);
        this.fromRadioCharacteristic = await service.getCharacteristic(fromRadioUuid);
      }
    } catch (err) {
      const domErr = err as DOMException;
      const isPairing = isWebBluetoothPairingError(err);
      console.debug(
        `[WebBluetooth:${this.sessionId}] GATT service/characteristic discovery failed:`,
        domErr?.name,
        domErr?.message,
        isPairing ? '(pairing-related)' : '',
      );
      console.debug('[WebBluetooth] GATT discovery raw error:', err);
      // "GATT Error: Not supported" typically means device requires pairing before GATT operations
      const error = new Error(
        `GATT Error: Not supported. The device may require pairing. ${domErr?.message ?? String(err)}`,
      ) as Error & { isPairingRelated?: boolean };
      error.isPairingRelated = true; // This error type is almost always pairing-related
      throw error;
    }

    this.fromRadioNotifyHandler = (event: Event) => {
      const target = event.target as unknown as BluetoothRemoteGATTCharacteristic | null;
      if (!target) return;
      const value = target.value;
      if (value && value.byteLength > 0) {
        const bytes = new Uint8Array(value.buffer);
        console.debug(`[WebBluetooth:${this.sessionId}] fromRadio notify: ${bytes.length} bytes`);
        if (this._fromDeviceController) {
          this._fromDeviceController.enqueue({ type: 'packet', data: bytes });
        }
      }
    };

    try {
      this.fromRadioCharacteristic.addEventListener(
        'characteristicvaluechanged',
        this.fromRadioNotifyHandler,
      );
      await this.fromRadioCharacteristic.startNotifications();
      console.debug(`[WebBluetooth:${this.sessionId}] notifications started`);
    } catch (err) {
      const domErr = err as DOMException;
      const isPairing = isWebBluetoothPairingError(err);
      console.debug(
        `[WebBluetooth:${this.sessionId}] startNotifications failed:`,
        domErr?.name,
        domErr?.message,
        isPairing ? '(pairing-related)' : '',
      );
      console.debug('[WebBluetooth] startNotifications raw error:', err);
      const error = new Error(
        `Failed to start Bluetooth notifications${isPairing ? ' (pairing issue)' : ''}: ${domErr?.message ?? String(err)}`,
      ) as Error & { isPairingRelated?: boolean };
      error.isPairingRelated = isPairing;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.device) return;

    try {
      if (this.fromRadioCharacteristic && this.fromRadioNotifyHandler) {
        this.fromRadioCharacteristic.removeEventListener(
          'characteristicvaluechanged',
          this.fromRadioNotifyHandler,
        );
        await this.fromRadioCharacteristic.stopNotifications();
      }
    } catch {
      // catch-no-log-ok ignore errors during cleanup
    }

    try {
      if (this.device.gatt?.connected) {
        this.device.gatt.disconnect();
      }
    } catch {
      // catch-no-log-ok ignore errors during disconnect
    }

    this.cleanup();
  }

  private cleanup(): void {
    if (this.fromRadioUnsub) {
      this.fromRadioUnsub();
      this.fromRadioUnsub = null;
    }
    this._fromDeviceController = null;
    this.device = null;
    this.server = null;
    this.toRadioCharacteristic = null;
    this.fromRadioCharacteristic = null;
    this.fromRadioNotifyHandler = null;
    this.connectStartedAtMs = null;
  }

  async writeToRadio(data: Uint8Array): Promise<void> {
    if (!this.toRadioCharacteristic) {
      throw new Error('Not connected');
    }

    const timeSinceConnect =
      this.connectStartedAtMs != null ? Date.now() - this.connectStartedAtMs : 'unknown';
    const hexDump = Array.from(data.subarray(0, Math.min(data.length, 20)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    console.info(
      `[WebBluetooth:${this.sessionId}] writeToRadio: ${data.length} bytes timeSinceConnect=${timeSinceConnect}ms data=[${hexDump}${data.length > 20 ? '...' : ''}]`,
    );

    await this.toRadioCharacteristic.writeValue(data);
    console.info(
      `[WebBluetooth:${this.sessionId}] writeToRadio done bytes=${data.length} timeSinceConnect=${timeSinceConnect}ms`,
    );
  }

  isConnected(): boolean {
    return this.device?.gatt?.connected ?? false;
  }

  getDeviceInfo(): { deviceId: string; deviceName: string } | null {
    if (!this.device) return null;
    return {
      deviceId: this.device.id,
      deviceName: this.device.name ?? 'Unknown Device',
    };
  }
}
