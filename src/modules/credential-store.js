/**
 * ADB Credential Store using Web Crypto API + IndexedDB
 * Stores RSA-2048 key pairs for ADB authentication
 * Conforms to @yume-chan/adb AdbCredentialStore interface:
 * generateKey(): Promise<AdbPrivateKey>
 * iterateKeys(): AsyncIterable<AdbPrivateKey>
 * where AdbPrivateKey = { buffer: Uint8Array, name?: string }
 */

const DB_NAME = 'car-jam-bot-adb';
const STORE_NAME = 'keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveKeyBuffer(buffer) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  // Store the ArrayBuffer or Uint8Array
  store.add(buffer);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadKeyBuffers() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const keys = [];
      for (const entry of request.result) {
        if (entry instanceof Uint8Array) {
          keys.push(entry);
        } else if (entry instanceof ArrayBuffer) {
          keys.push(new Uint8Array(entry));
        } else if (entry?.buffer) {
          keys.push(new Uint8Array(entry.buffer));
        }
      }
      resolve(keys);
    };
    request.onerror = () => reject(request.error);
  });
}

export class AdbWebCredentialStore {
  async generateKey() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-1',
      },
      true,
      ['sign', 'verify']
    );

    const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const keyBuffer = new Uint8Array(pkcs8);
    await saveKeyBuffer(keyBuffer);

    return {
      buffer: keyBuffer,
      name: 'car-jam-bot',
    };
  }

  async *iterateKeys() {
    const keyBuffers = await loadKeyBuffers();
    for (const keyBuffer of keyBuffers) {
      yield {
        buffer: keyBuffer,
        name: 'car-jam-bot',
      };
    }
  }
}
