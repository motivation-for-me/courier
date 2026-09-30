'use client';

import { useEffect, useState } from 'react';

export function PwaController() {
  const [online, setOnline] = useState(true);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    setOnline(navigator.onLine);
    const wentOnline = () => setOnline(true); const wentOffline = () => setOnline(false);
    window.addEventListener('online', wentOnline); window.addEventListener('offline', wentOffline);
    let reloading = false;
    const register = async () => {
      if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      if (registration.waiting) setUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdate(worker); }); });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; window.location.reload(); } });
    };
    void register();
    return () => { window.removeEventListener('online', wentOnline); window.removeEventListener('offline', wentOffline); };
  }, []);
  return <>{!online && <div className="connection-banner offline" role="status">You are offline. Actions are disabled until the connection returns.</div>}{update && <div className="connection-banner update" role="status"><span>A newer SwiftLog version is ready.</span><button onClick={() => update.postMessage({ type: 'SKIP_WAITING' })} type="button">Update now</button></div>}</>;
}
