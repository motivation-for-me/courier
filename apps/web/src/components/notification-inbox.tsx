'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { dataChangedEvent, getNotificationInbox, getSession, readAllNotifications, readNotification, sendRiderMessage, type AppNotification } from '../lib/api';

const notificationsChanged = 'courier:notifications-changed';
function Bell() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
}

export function NotificationInbox() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const [notice, setNotice] = useState<AppNotification | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const suppressNotice = useRef(true);
  const container = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const sequence = useRef(0);
  const panelId = useId();
  const canReply = !!getSession()?.user.roles.includes('RIDER');

  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const inbox = await getNotificationInbox(unreadOnly);
      if (request !== sequence.current) return;
      if (seen.current && !suppressNotice.current) {
        const latest = inbox.items.find((item) => item.status === 'UNREAD' && !seen.current?.has(item.id));
        if (latest) setNotice(latest);
      }
      if (!seen.current) seen.current = new Set();
      inbox.items.forEach((item) => seen.current?.add(item.id));
      suppressNotice.current = false;
      setItems(inbox.items); setUnread(inbox.unread); setError('');
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : 'Notifications could not be loaded.');
    } finally { if (request === sequence.current) setLoading(false); }
  }, [unreadOnly]);

  useEffect(() => {
    suppressNotice.current = true;
    setLoading(true);
    void load();
    const refresh = () => { if (!document.hidden && getSession()) void load(); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener(dataChangedEvent, refresh);
    window.addEventListener(notificationsChanged, refresh);
    return () => {
      ++sequence.current; window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener(dataChangedEvent, refresh);
      window.removeEventListener(notificationsChanged, refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); bell.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  async function markRead(item?: AppNotification) {
    setBusy(true); setError('');
    try {
      if (item) await readNotification(item.id); else await readAllNotifications();
      window.dispatchEvent(new Event(notificationsChanged));
      if (item?.payload?.section === 'payments') {
        if (item.payload.riderId) sessionStorage.setItem('swiftlog.payment-rider', item.payload.riderId);
        window.dispatchEvent(new CustomEvent('swiftlog.open-payments'));
        setOpen(false);
      }
      if (item?.payload?.cnNumber) {
        sessionStorage.setItem('swiftlog.tracking-query', item.payload.cnNumber);
        window.dispatchEvent(new CustomEvent('swiftlog.open-tracking'));
        setOpen(false);
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not mark notifications as read.'); }
    finally { setBusy(false); }
  }

  async function submitReply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!reply.trim() || busy) return;
    setBusy(true); setReplyMessage('');
    try { await sendRiderMessage(reply.trim()); setReply(''); setReplyMessage('Message sent to the admin team.'); }
    catch (failure) { setReplyMessage(failure instanceof Error ? failure.message : 'Message could not be sent.'); }
    finally { setBusy(false); }
  }

  return <div className="notification-inbox" ref={container}>
    {notice && <div className="notification-toast" role="status"><button onClick={() => { setOpen(true); setNotice(null); }} type="button"><strong>{notice.payload?.title || 'New notification'}</strong><small>{notice.payload?.message || 'Open your inbox to view the update.'}</small></button><button aria-label="Dismiss notification" onClick={() => setNotice(null)} type="button">×</button></div>}
    <button ref={bell} aria-label={`Notifications, ${unread} unread`} aria-expanded={open} aria-controls={panelId} className="icon-button notification" onClick={() => { setOpen(!open); if (!open) void load(); }} type="button"><Bell />{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section className="notification-panel" id={panelId} aria-label="Notification inbox">
      <header><strong>Notifications {unread > 0 && `(${unread})`}</strong><button disabled={busy || !unread} onClick={() => void markRead()} type="button">Mark all read</button></header>
      <div className="notification-filters"><button aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)} type="button">All</button><button aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)} type="button">Unread</button><button onClick={() => void load()} type="button">Refresh</button></div>
      {error && <div className="notification-error" role="alert">{error}<button onClick={() => void load()} type="button">Retry</button></div>}
      {loading ? <div className="notification-skeleton" aria-label="Loading notifications"><i /><i /><i /></div> : items.length ? <div className="notification-list">{items.map((item) => <button disabled={busy} className={item.status === 'READ' ? '' : 'unread'} key={item.id} onClick={() => void markRead(item)} type="button"><span className="notification-event-icon" aria-hidden="true">{item.template === 'DELIVERY_COMPLETED' ? '✓' : item.template === 'DELIVERY_FAILED' ? '!' : '•'}</span><span><strong>{item.payload?.title || item.template.replaceAll('_', ' ')}</strong><small>{item.payload?.message || 'You have a new update.'}</small><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>{item.payload?.cnNumber && <small className="notification-action">View shipment →</small>}</span></button>)}</div> : !error && <p className="notification-empty">{unreadOnly ? 'You’re all caught up. No unread notifications.' : 'No updates yet. Shipment and delivery alerts will appear here.'}</p>}
      <div className="notification-footer" role="status" aria-live="polite">{unread} unread · Latest 50 updates · Refreshes every 15 seconds</div>
      {canReply && <form className="notification-reply" onSubmit={submitReply}><label htmlFor={`${panelId}-reply`}>Message admin team</label><div><input id={`${panelId}-reply`} maxLength={500} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a message" /><button disabled={busy || !reply.trim()} type="submit">Send</button></div>{replyMessage && <small role="status">{replyMessage}</small>}</form>}
    </section>}
  </div>;
}
