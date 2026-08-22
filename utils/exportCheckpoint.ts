const DB_NAME = 'gpt-organizer';
const DB_VERSION = 1;
const STORE_NAME = 'export_checkpoints';
const CHECKPOINT_KEY = 'export-all-enriched';

export type CheckpointConv = {
  id: string;
  title: string;
  gizmoId: string | null;
  projectName: string | null;
  source: 'no_project' | 'project';
};

export type ExportCheckpoint = {
  version: 1;
  startedAt: string;
  conversations: CheckpointConv[];
  completedIds: string[];
  records: string[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadExportCheckpoint(): Promise<ExportCheckpoint | null> {
  try {
    const db = await openDb();
    return await new Promise<ExportCheckpoint | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CHECKPOINT_KEY);
      req.onsuccess = () => {
        db.close();
        const val = req.result as ExportCheckpoint | undefined;
        resolve(val?.version === 1 ? val : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function saveExportCheckpoint(cp: ExportCheckpoint): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(cp, CHECKPOINT_KEY);
      req.onsuccess = () => {
        db.close();
        resolve();
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    // non-fatal — export continues without checkpoint persistence
  }
}

export async function clearExportCheckpoint(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(CHECKPOINT_KEY);
      req.onsuccess = () => {
        db.close();
        resolve();
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    // non-fatal
  }
}
