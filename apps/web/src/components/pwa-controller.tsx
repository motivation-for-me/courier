'use client';

import { useEffect, useState } from 'react';
import { getPendingOfflineOperations, offlineSyncEvent, syncOfflineOperations } from '../lib/offline-sync';

export function PwaController() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(0);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    setOnline(navigator.onLine);
    const refreshQueue = () => { void getPendingOfflineOperations().then((items) => { setPending(items.length); setSyncFailed(items.filter((item) => item.status === 'failed').length); }).catch(() => undefined); };
    const synchronize = () => {
      setOnline(true);
      setSyncing(true);
      void syncOfflineOperations().finally(() => { setSyncing(false); refreshQueue(); });
    };
    const wentOnline = synchronize; const wentOffline = () => setOnline(false);
    window.addEventListener('online', wentOnline); window.addEventListener('offline', wentOffline);
    const becameVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine) synchronize(); };
    document.addEventListener('visibilitychange', becameVisible);
    window.addEventListener(offlineSyncEvent, refreshQueue);
    refreshQueue();
    let reloading = false;
    const register = async () => {
      if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      if (registration.waiting) setUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(worker); }); });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; window.location.reload(); } });
    };
    void register();
    return () => { window.removeEventListener('online', wentOnline); window.removeEventListener('offline', wentOffline); document.removeEventListener('visibilitychange', becameVisible); window.removeEventListener(offlineSyncEvent, refreshQueue); };
  }, []);
  return <>{(!online || syncing || pending > 0) && <div className={`connection-banner ${online ? 'offline' : 'offline'}`} role="status">{!online ? 'Offline mode. Cached data and permitted actions remain available.' : syncing ? 'Synchronizing pending changes…' : `${pending} change${pending === 1 ? '' : 's'} pending synchronization.`}{syncFailed > 0 && ` ${syncFailed} need${syncFailed === 1 ? 's' : ''} attention.`}</div>}{update && <div className="connection-banner update" role="status"><span>A newer Brisk Career System version is ready.</span><button onClick={() => update.postMessage({ type: 'SKIP_WAITING' })} type="button">Update now</button></div>}</>;
}
