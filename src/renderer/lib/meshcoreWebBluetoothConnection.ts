import { Connection } from '@liamcottle/meshcore.js';
import type { Types } from '@meshtastic/core';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- TransportWebBluetoothIpc is used as a value (new) in connect()
import { TransportWebBluetoothIpc } from './transportWebBluetoothIpc';

export class MeshcoreWebBluetoothConnection extends Connection {
  private readonly transport: TransportWebBluetoothIpc;
  private _fromDeviceReader: ReadableStreamDefaultReader<Types.DeviceOutput> | null = null;

  constructor(transport: TransportWebBluetoothIpc) {
    super();
    this.transport = transport;
  }

  async sendToRadioFrame(data: Uint8Array): Promise<void> {
    this.emit('tx', data);
    const writer = this.transport.toDevice.getWriter();
    try {
      await writer.ready;
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  async close(): Promise<void> {
    if (this._fromDeviceReader) {
      await this._fromDeviceReader.cancel().catch(() => {});
      this._fromDeviceReader = null;
    }
    await this.transport.disconnect();
  }

  async connect(): Promise<void> {
    await this.transport.requestDevice();
    await this.transport.connect();

    this._fromDeviceReader = this.transport.fromDevice.getReader();
    void this._readLoop();

    await this.onConnected();
  }

  private async _readLoop(): Promise<void> {
    try {
      while (true) {
        const { done, value } = await this._fromDeviceReader!.read();
        if (done) break;
        if (value.type === 'packet') {
          this.onFrameReceived(value.data);
        }
      }
    } catch {
      // catch-no-log-ok reader error or closed
    }
  }
}
