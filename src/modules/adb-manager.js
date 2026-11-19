import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import { AdbWebCredentialStore } from './credential-store.js';

const GAME_PACKAGE = 'car.jam.traffic.puzzle.match.parking.escape';

export class AdbManager extends EventTarget {
  constructor() {
    super();
    this._adb = null;
    this._device = null;
    this._transport = null;
    this._credentialStore = new AdbWebCredentialStore();
    this._connected = false;
  }

  get isConnected() { return this._connected; }
  get adb() { return this._adb; }

  async connect() {
    // 1. Check WebUSB support
    if (!navigator.usb) {
      throw new Error('WebUSB not supported. Use Chrome or Edge.');
    }

    // 2. Request USB device (shows browser picker)
    const manager = new AdbDaemonWebUsbDeviceManager(navigator.usb);
    this._device = await manager.requestDevice();
    if (!this._device) {
      throw new Error('No device selected.');
    }

    // 3. Connect to device
    const connection = await this._device.connect();

    // 4. Authenticate and create transport
    this._transport = await AdbDaemonTransport.authenticate({
      serial: this._device.serial,
      connection,
      credentialStore: this._credentialStore,
    });

    // 5. Create ADB instance
    this._adb = new Adb(this._transport);
    this._connected = true;

    // Get device model
    const model = await this.shell('getprop ro.product.model');
    const android = await this.shell('getprop ro.build.version.release');

    this.dispatchEvent(new CustomEvent('connected', {
      detail: { model: model.trim(), android: android.trim(), serial: this._device.serial }
    }));

    return { model: model.trim(), android: android.trim() };
  }

  async disconnect() {
    if (this._transport) {
      try { await this._transport.close(); } catch (e) { /* ignore */ }
    }
    this._adb = null;
    this._transport = null;
    this._device = null;
    this._connected = false;
    this.dispatchEvent(new CustomEvent('disconnected'));
  }

  async shell(command) {
    if (!this._adb) throw new Error('Not connected');
    // spawnAndWait for text commands
    const result = await this._adb.subprocess.spawnAndWait(command);
    return result.stdout;
  }

  async takeScreenshot() {
    if (!this._adb) throw new Error('Not connected');
    // Use spawn for binary data (screencap outputs PNG)
    const process = await this._adb.subprocess.spawn('/system/bin/screencap -p');
    const chunks = [];
    const reader = process.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    await process.exit;
    // Concatenate chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  async tap(x, y) {
    if (!this._adb) throw new Error('Not connected');
    await this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
    this.dispatchEvent(new CustomEvent('tap', { detail: { x, y } }));
  }

  async back() {
    if (!this._adb) throw new Error('Not connected');
    await this.shell('input keyevent 4');
  }

  async launchGame() {
    if (!this._adb) throw new Error('Not connected');
    await this.shell(
      `monkey -p ${GAME_PACKAGE} -c android.intent.category.LAUNCHER 1`
    );
  }

  async getScreenSize() {
    const output = await this.shell('wm size');
    const match = output.match(/(\d+)x(\d+)/);
    if (match) {
      return { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
    return { width: 1080, height: 2400 }; // default
  }

  screenshotToBase64(pngData) {
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < pngData.length; i += chunkSize) {
      const sub = pngData.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, sub);
    }
    return btoa(binary);
  }

  screenshotToDataUrl(pngData) {
    return `data:image/png;base64,${this.screenshotToBase64(pngData)}`;
  }
}
