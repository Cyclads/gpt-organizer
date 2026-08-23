import type { ImportPlanRow } from './importPlan';

const DB_NAME = 'gpt-organizer';
const DB_VERSION = 1;
const STORE_NAME = 'export_checkpoints'; // shared object store, different key
const CHECKPOINT_KEY = 'import-csv-plan';

export type ImportRowState = {
  id: string;
  action: string;
  renameDone: boolean;   // rename sub-op completed (or not needed)
  primaryDone: boolean;  // move/remove/delete sub-op completed (or not needed)
  completed: boolean;    // all sub-ops done (ok or error)
  error: string | null;  // non-429 terminal error, null if ok
};

export type ImportCheckpoint = {
  version: 1;
  startedAt: string;
  csvFingerprint: string;
  rowStates: ImportRowState[];
  stats: {
    renameCount: number;
    moveCount: number;
    removeCount: number;
    deleteCount: number;
    projectsCreatedCount: number;
    rateLimitCooldowns: number;
  };
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

export async function loadImportCheckpoint(): Promise<ImportCheckpoint | null> {
  try {
    const db = await openDb();
    return await new Promise<ImportCheckpoint | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CHECKPOINT_KEY);
      req.onsuccess = () => {
        db.close();
        const val = req.result as ImportCheckpoint | undefined;
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

export async function saveImportCheckpoint(cp: ImportCheckpoint): Promise<void> {
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
    // non-fatal — import continues without checkpoint persistence
  }
}

export async function clearImportCheckpoint(): Promise<void> {
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

/** SHA-256 fingerprint of the actionable rows (stable across sessions for the same CSV). */
export async function fingerprintPlan(rows: ImportPlanRow[]): Promise<string> {
  const stable = JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      action: r.action,
      newTitle: r.newTitle ?? null,
      targetGizmoId: r.targetGizmoId ?? null,
      projectName: r.projectName ?? null,
    })),
  );
  const encoded = new TextEncoder().encode(stable);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
