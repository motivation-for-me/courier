const DATABASE_NAME = 'bcs-offline';
const DATABASE_VERSION = 1;
const STORES = {
  cache: 'cache',
  operations: 'operations',
  metadata: 'metadata',
} as const;

export type OfflineOperation = {
  id: string;
  ownerId?: string;
  key: string;
  path: string;
  method: string;
  body?: string;
  createdAt: string;
  attempts: number;
  status: 'pending' | 'failed';
  error?: string;
};

function browserAvailable() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!browserAvailable()) return Promise.reject(new Error('Offline storage is only available in a browser.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Unable to open offline storage.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORES.cache)) database.createObjectStore(STORES.cache);
      if (!database.objectStoreNames.contains(STORES.operations)) database.createObjectStore(STORES.operations, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(STORES.metadata)) database.createObjectStore(STORES.metadata);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = work(database.transaction(storeName, mode).objectStore(storeName));
    if (!request) { database.close(); resolve(undefined); return; }
    request.onerror = () => { database.close(); reject(request.error ?? new Error('Offline storage request failed.')); };
    request.onsuccess = () => { database.close(); resolve(request.result); };
  });
}

export async function cacheOfflineValue<T>(key: string, value: T): Promise<void> {
  await transaction(STORES.cache, 'readwrite', (store) => store.put({ value, savedAt: new Date().toISOString() }, key));
}

export function offlineCacheKey(userId: string, path: string) {
  return `${userId}:${path}`;
}

export async function readOfflineValue<T>(key: string): Promise<{ value: T; savedAt: string } | undefined> {
  return transaction<{ value: T; savedAt: string }>(STORES.cache, 'readonly', (store) => store.get(key));
}

export async function saveOfflineOperation(operation: OfflineOperation): Promise<void> {
  await transaction(STORES.operations, 'readwrite', (store) => store.put(operation));
}

export async function queueOfflineOperation(path: string, body: unknown, key: string, ownerId?: string): Promise<void> {
  await saveOfflineOperation({
    id: key,
    ownerId,
    key,
    path,
    method: 'POST',
    body: JSON.stringify(body),
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('courier:offline-sync'));
}

export async function listOfflineOperations(): Promise<OfflineOperation[]> {
  return (await transaction<OfflineOperation[]>(STORES.operations, 'readonly', (store) => store.getAll())) ?? [];
}

export async function deleteOfflineOperation(id: string): Promise<void> {
  await transaction(STORES.operations, 'readwrite', (store) => store.delete(id));
}

export async function setOfflineMetadata<T>(key: string, value: T): Promise<void> {
  await transaction(STORES.metadata, 'readwrite', (store) => store.put(value, key));
}

export async function getOfflineMetadata<T>(key: string): Promise<T | undefined> {
  return transaction<T>(STORES.metadata, 'readonly', (store) => store.get(key));
}

export async function clearOfflineData(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(Object.values(STORES), 'readwrite');
    request.objectStore(STORES.cache).clear();
    request.objectStore(STORES.operations).clear();
    request.objectStore(STORES.metadata).clear();
    request.onerror = () => reject(request.error ?? new Error('Unable to clear offline storage.'));
    request.oncomplete = () => resolve();
  });
  database.close();
}

export async function clearOfflineCache(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction([STORES.cache, STORES.metadata], 'readwrite');
    request.objectStore(STORES.cache).clear();
    request.objectStore(STORES.metadata).clear();
    request.onerror = () => reject(request.error ?? new Error('Unable to clear offline cache.'));
    request.oncomplete = () => resolve();
  });
  database.close();
}
