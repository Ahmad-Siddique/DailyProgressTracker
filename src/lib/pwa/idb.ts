import type { CachedRecord, MutationReceiptLocal, OutboxJob } from "./outbox-types";

const DB_VERSION = 1;

function dbName(userId: string) {
  return `dayboard:${userId}`;
}

function openDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(userId), DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "recordKey" });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("receipts")) {
        db.createObjectStore("receipts", { keyPath: "idempotencyKey" });
      }
    };
  });
}

async function withStore<T>(
  userId: string,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    Promise.resolve(fn(store))
      .then((result) => {
        tx.oncomplete = () => resolve(result as T);
        tx.onerror = () => reject(tx.error);
      })
      .catch(reject);
  });
}

export async function deleteOwnerDatabase(userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName(userId));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listOutboxJobs(userId: string): Promise<OutboxJob[]> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const req = tx.objectStore("outbox").getAll();
    req.onsuccess = () => {
      const jobs = (req.result as OutboxJob[]).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      resolve(jobs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countPendingJobs(userId: string): Promise<number> {
  const jobs = await listOutboxJobs(userId);
  return jobs.filter((j) => (j.status ?? "pending") === "pending").length;
}

export async function putOutboxJob(userId: string, job: OutboxJob): Promise<void> {
  await withStore(userId, "outbox", "readwrite", (store) => store.put(job));
}

export async function removeOutboxJob(userId: string, jobId: string): Promise<void> {
  await withStore(userId, "outbox", "readwrite", (store) => store.delete(jobId));
}

export async function updateOutboxJob(
  userId: string,
  job: OutboxJob,
): Promise<void> {
  await putOutboxJob(userId, job);
}

export async function putReceipt(
  userId: string,
  receipt: MutationReceiptLocal,
): Promise<void> {
  await withStore(userId, "receipts", "readwrite", (store) => store.put(receipt));
}

export async function getReceipt(
  userId: string,
  idempotencyKey: string,
): Promise<MutationReceiptLocal | null> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("receipts", "readonly");
    const req = tx.objectStore("receipts").get(idempotencyKey);
    req.onsuccess = () => resolve((req.result as MutationReceiptLocal) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putRecord(
  userId: string,
  record: Omit<CachedRecord, "recordKey"> & { recordKey?: string },
): Promise<void> {
  const full: CachedRecord = {
    ...record,
    recordKey: record.recordKey ?? `${record.table}:${record.id}`,
  };
  await withStore(userId, "records", "readwrite", (store) => store.put(full));
}

export async function listRecords(
  userId: string,
  table: string,
): Promise<CachedRecord[]> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const req = tx.objectStore("records").getAll();
    req.onsuccess = () => {
      const all = req.result as CachedRecord[];
      resolve(all.filter((r) => r.table === table));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function latestRecordSyncAt(userId: string): Promise<string | null> {
  const db = await openDb(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const req = tx.objectStore("records").getAll();
    req.onsuccess = () => {
      const all = req.result as CachedRecord[];
      if (all.length === 0) {
        resolve(null);
        return;
      }
      const latest = all
        .map((r) => r.storedAt)
        .sort()
        .at(-1);
      resolve(latest ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export function setQuickAddDirty(dirty: boolean) {
  if (typeof window === "undefined") return;
  (window as Window & { __dayboardDirty?: boolean }).__dayboardDirty = dirty;
}

export function isQuickAddDirty(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { __dayboardDirty?: boolean }).__dayboardDirty,
  );
}