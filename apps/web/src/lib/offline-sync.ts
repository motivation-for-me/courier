import { apiRequest, getSession } from './api';
import { deleteOfflineOperation, listOfflineOperations, saveOfflineOperation, setOfflineMetadata, type OfflineOperation } from './offline-db';

export const offlineSyncEvent = 'courier:offline-sync';

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(offlineSyncEvent));
}

export function newOfflineOperationKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function queueOfflineRequest(path: string, body: unknown, key = newOfflineOperationKey()): Promise<string> {
  const operation: OfflineOperation = { id: key, key, path, method: 'POST', body: JSON.stringify(body), createdAt: new Date().toISOString(), attempts: 0, status: 'pending' };
  await saveOfflineOperation(operation);
  notify();
  return key;
}

export async function getPendingOfflineOperations() {
  const ownerId = getSession()?.user.id;
  return (await listOfflineOperations()).filter((operation) => operation.ownerId === ownerId && (operation.status === 'pending' || operation.status === 'failed')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function syncOfflineOperations(): Promise<{ completed: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { completed: 0, failed: 0 };
  let completed = 0;
  let failed = 0;
  for (const operation of await getPendingOfflineOperations()) {
    try {
      const response = await apiRequest<{ id?: string; cnNumber?: string }>(operation.path, { method: operation.method, body: operation.body, headers: { 'Idempotency-Key': operation.key } });
      if (operation.path === '/consignments' && response.cnNumber) {
        await setOfflineMetadata(`created:${operation.key}`, { id: response.id, cnNumber: response.cnNumber, synchronizedAt: new Date().toISOString() });
      }
      await deleteOfflineOperation(operation.id);
      completed += 1;
    } catch (error) {
      failed += 1;
      await saveOfflineOperation({ ...operation, attempts: operation.attempts + 1, status: 'failed', error: error instanceof Error ? error.message : 'Synchronization failed.' });
    }
    notify();
  }
  return { completed, failed };
}
