import { SheetOverrideConfig } from './driveLogParser';

export interface StoredProjectExcelFile {
  id: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  savedAtMs: number;
  buffer: ArrayBuffer;
  sheetOverrides: Record<number, SheetOverrideConfig>;
  excludedSheetIndices: number[];
  sourceLabel?: string;
  uploadedBy?: string;
  uploaderName?: string;
  isCloudSynced?: boolean;
}

const DB_NAME = 'elmassa_excel_logs_store_v1';
const STORE_NAME = 'project_workbooks';
const DB_VERSION = 1;

function openExcelLogsDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadAllStoredExcelFiles(): Promise<StoredProjectExcelFile[]> {
  const db = await openExcelLogsDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? (req.result as StoredProjectExcelFile[]) : [];
        items.sort((a, b) => (b.savedAtMs || 0) - (a.savedAtMs || 0));
        resolve(items);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function saveStoredExcelFile(record: StoredProjectExcelFile): Promise<void> {
  const db = await openExcelLogsDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function deleteStoredExcelFile(id: string): Promise<void> {
  const db = await openExcelLogsDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllStoredExcelFiles(): Promise<void> {
  const db = await openExcelLogsDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

