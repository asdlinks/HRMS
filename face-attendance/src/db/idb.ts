// Tiny promise-based IndexedDB wrapper — no external dependency. Two concerns:
//   - the synced enrollment set (so face matching survives a network outage)
//   - the offline check-in queue (so a check-in made while offline is delivered
//     on reconnect)
// Both must persist independently of the service worker; this is the app's own
// durable store, not an SW cache.
import type { Enrollment, QueuedCheckIn } from '../types';

const DB_NAME = 'mywe-kiosk';
const DB_VERSION = 1;
const STORE_SYNC = 'sync'; // single row, key 'current'
const STORE_QUEUE = 'queue'; // keyPath idempotencyKey

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SYNC)) db.createObjectStore(STORE_SYNC, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'idempotencyKey' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---------------- synced enrollment set ----------------

interface SyncRow {
  id: 'current';
  enrollments: Enrollment[];
  syncedAt: string;
}

export async function saveSync(enrollments: Enrollment[], syncedAt: string): Promise<void> {
  await tx<IDBValidKey>(STORE_SYNC, 'readwrite', (s) => s.put({ id: 'current', enrollments, syncedAt } as SyncRow));
}

export async function loadSync(): Promise<{ enrollments: Enrollment[]; syncedAt: string } | null> {
  const row = await tx<SyncRow | undefined>(STORE_SYNC, 'readonly', (s) => s.get('current'));
  return row ? { enrollments: row.enrollments, syncedAt: row.syncedAt } : null;
}

// ---------------- offline check-in queue ----------------

export async function enqueueCheckIn(item: QueuedCheckIn): Promise<void> {
  await tx<IDBValidKey>(STORE_QUEUE, 'readwrite', (s) => s.put(item));
}

export async function listQueue(): Promise<QueuedCheckIn[]> {
  const all = await tx<QueuedCheckIn[]>(STORE_QUEUE, 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeFromQueue(idempotencyKey: string): Promise<void> {
  await tx<undefined>(STORE_QUEUE, 'readwrite', (s) => s.delete(idempotencyKey));
}

export async function queueCount(): Promise<number> {
  return tx<number>(STORE_QUEUE, 'readonly', (s) => s.count());
}
