import { OfflinePdfRecord } from '../types/study';

const DB_NAME = 'polytechnic_hub_offline_v1';
const DB_VERSION = 1;
const STORE_PDFS = 'offline_pdfs';
const STORE_KV = 'offline_cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_KV)) {
        db.createObjectStore(STORE_KV, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

export const offlineDb = {
  async saveOfflinePdf(record: OfflinePdfRecord): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PDFS, 'readwrite');
      tx.objectStore(STORE_PDFS).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save offline PDF'));
    });
  },

  async listOfflinePdfs(): Promise<OfflinePdfRecord[]> {
    try {
      const db = await openDb();
      return await new Promise<OfflinePdfRecord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_PDFS, 'readonly');
        const req = tx.objectStore(STORE_PDFS).getAll();
        req.onsuccess = () => {
          const items = (req.result as OfflinePdfRecord[]) ?? [];
          items.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
          resolve(items);
        };
        req.onerror = () => reject(req.error ?? new Error('Failed to list offline PDFs'));
      });
    } catch {
      return [];
    }
  },

  async getOfflinePdf(id: string): Promise<OfflinePdfRecord | null> {
    try {
      const db = await openDb();
      return await new Promise<OfflinePdfRecord | null>((resolve, reject) => {
        const tx = db.transaction(STORE_PDFS, 'readonly');
        const req = tx.objectStore(STORE_PDFS).get(id);
        req.onsuccess = () => resolve((req.result as OfflinePdfRecord) ?? null);
        req.onerror = () => reject(req.error ?? new Error('Failed to fetch offline PDF'));
      });
    } catch {
      return null;
    }
  },

  async deleteOfflinePdf(id: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PDFS, 'readwrite');
      tx.objectStore(STORE_PDFS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to delete offline PDF'));
    });
  },

  async setCachedValue<T>(key: string, value: T): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_KV, 'readwrite');
        tx.objectStore(STORE_KV).put({ key, value, updatedAt: new Date().toISOString() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore storage quota issues gracefully
    }
  },

  async getCachedValue<T>(key: string): Promise<T | null> {
    try {
      const db = await openDb();
      return await new Promise<T | null>((resolve) => {
        const tx = db.transaction(STORE_KV, 'readonly');
        const req = tx.objectStore(STORE_KV).get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },
};
