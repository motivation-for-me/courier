'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { completePickup, completeRiderDelivery, createConsignment, dataChangedEvent, failPickup, failRiderDelivery, getAccessTokenExpiry, getAssignedPickups, getConsignments, getMyRiderAssignments, getNotifications, getSession, login, logout, openDispatchDocument, readAllNotifications, readNotification, sessionExpiredEvent, startPickup, unlockRiderDispatch, updateRiderDispatchStatus, type ApiError, type AppNotification, type AuthSession, type PickupAssignment, type RiderDeliveryAssignment, type RiderScanResult, type RiderStatus } from '../lib/api';
import { DispatchCreate } from './dispatch-create';
import { DispatchDashboard, DispatchList, TrackingView } from './dispatch-views';
import { RiderManagement } from './rider-management';
import { SettingsPanel } from './settings-panel';

type View = 'dashboard' | 'consignments' | 'booking' | 'tracking' | 'rider' | 'riders' | 'manifest' | 'settings';

type NavItem = { label: string; icon: string; view: View; permission?: string };
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  { label: 'Dashboard', items: [{ label: 'Overview', icon: 'speed', view: 'dashboard' }] },
  {
    label: 'Dispatches',
    items: [
      { label: 'All Dispatches', icon: 'inventory_2', view: 'consignments', permission: 'shipment:view' },
      { label: 'Create Dispatch', icon: 'add_box', view: 'booking', permission: 'shipment:create' },
      { label: 'Track / Scan CN', icon: 'qr_code_scanner', view: 'tracking', permission: 'shipment:view' },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { label: 'Rider Workspace', icon: 'two_wheeler', view: 'rider', permission: 'delivery:view' },
      { label: 'Management', icon: 'settings_suggest', view: 'riders', permission: 'user:view' },
    ],
  },
  { label: 'System', items: [{ label: 'Settings', icon: 'tune', view: 'settings', permission: 'user:view' }] },
];

const statusStyles: Record<string, string> = {
  BOOKED: 'status-booked',
  VERIFIED: 'status-booked',
  MANIFESTED: 'status-transit',
  DISPATCHED: 'status-transit',
  IN_TRANSIT: 'status-transit',
  RECEIVED: 'status-received',
  ASSIGNED_TO_RIDER: 'status-ofd',
  OUT_FOR_DELIVERY: 'status-ofd',
  DELIVERED: 'status-delivered',
  DELIVERY_ATTEMPT_FAILED: 'status-failed',
  RETURNED: 'status-returned',
  HELD: 'status-held',
};

const statusLabel = (status: string) => status.replaceAll('_', ' ');

function Icon({ name }: { name: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined icon">{name}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${statusStyles[status] ?? 'status-neutral'}`}>{statusLabel(status)}</span>;
}

function Sidebar({ activeView, onNavigate, user, collapsed }: { activeView: View; onNavigate: (view: View) => void; user: AuthSession['user']; collapsed: boolean }) {
  const riderOnly = user.roles.length === 1 && user.roles.includes('RIDER');
  const visible = (item: NavItem) => riderOnly ? ['rider', 'settings'].includes(item.view) : (!item.permission || user.permissions.includes(item.permission)) && (!['riders','settings'].includes(item.view) || user.roles.includes('ADMIN'));
  return (
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-wordmark" aria-label="SwiftLog">Swift<span>Log</span></div></div>
      <div className="hub-context"><span className="live-dot" /> COMPANY DISPATCH <b>LIVE</b></div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigation.filter((group) => group.items.some(visible)).map((group) => (
          <section key={group.label} className="nav-group">
            <span className="nav-label">{group.label}</span>
            {group.items.filter(visible).map((item) => (
              <button key={item.label} aria-label={collapsed ? item.label : undefined} data-tooltip={item.label} className={`nav-item ${activeView === item.view ? 'active' : ''}`} onClick={() => onNavigate(item.view)} type="button">
                <Icon name={item.icon} /><span>{item.label}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>
      <div className="sidebar-footer"><div className="avatar">{user.displayName.slice(0, 2).toUpperCase()}</div><div><strong>{user.displayName}</strong><span>{user.roles.join(', ')}</span></div>{user.roles.includes('ADMIN') && <button aria-label="Settings" className="icon-button" onClick={() => onNavigate('settings')} type="button"><Icon name="settings" /></button>}</div>
    </aside>
  );
}

function MobileNavigation({ activeView, onNavigate, riderOnly = false }: { activeView: View; onNavigate: (view: View) => void; riderOnly?: boolean }) {
  const items: Array<[View, string, string]> = riderOnly ? [['rider', 'two_wheeler', 'Deliveries'], ['settings', 'palette', 'Theme']] : [['dashboard', 'speed', 'Home'], ['consignments', 'inventory_2', 'Dispatches'], ['booking', 'add_circle', 'Create'], ['tracking', 'qr_code_scanner', 'Track'], ['rider', 'person', 'Rider']];
  return <nav className="mobile-nav" aria-label="Mobile navigation"><div className="mobile-dock">{items.map(([view, icon, label]) => <button key={view} aria-label={label} className={activeView === view ? 'active' : ''} onClick={() => onNavigate(view)} type="button"><Icon name={icon} /><span>{label}</span></button>)}</div></nav>;
}

function LegacyHeader({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const title = view === 'dashboard' ? 'Courier Dashboard' : view === 'consignments' ? 'All Shipments' : view === 'booking' ? 'Create Shipment' : view === 'rider' ? 'Rider Workspace' : view === 'riders' ? 'Branches & Team' : 'Track Shipment';
  return <header className="topbar"><div className="topbar-title"><span className="eyebrow">OPERATIONS / LIVE CONTROL</span><h1>{title}</h1></div><div className="topbar-actions"><label className="global-search"><Icon name="search" /><input aria-label="Search consignments" placeholder="Search CN, manifest, rider..." /><kbd>⌘ K</kbd></label><button aria-label="Scan barcode" className="icon-button scanner" onClick={() => onNavigate('manifest')} type="button"><Icon name="barcode_scanner" /></button><button aria-label="Notifications" className="icon-button notification" type="button"><Icon name="notifications" /><span>3</span></button><div className="avatar">SM</div></div></header>;
}

function NotificationInbox() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); getNotifications().then(setItems).catch(() => setItems([])).finally(() => setLoading(false)); };
  useEffect(load, []);
  useEffect(() => { const refresh = () => load(); window.addEventListener(dataChangedEvent, refresh); return () => window.removeEventListener(dataChangedEvent, refresh); }, []);
  const unread = items.filter((item) => item.status !== 'READ').length;
  return <div className="notification-inbox"><button aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} className="icon-button notification" onClick={() => setOpen((value) => !value)} type="button"><Icon name="notifications" />{unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}</button>{open && <section className="notification-panel"><header><strong>Notifications</strong>{unread > 0 && <button onClick={() => void readAllNotifications().then(load)} type="button">Mark all read</button>}</header>{loading ? <div className="notification-skeleton"><i /><i /><i /></div> : items.length ? <div className="notification-list">{items.map((item) => <button className={item.status === 'READ' ? '' : 'unread'} key={item.id} onClick={() => void readNotification(item.id).then(load)} type="button"><Icon name={item.status === 'READ' ? 'notifications_none' : 'notifications_active'} /><span><strong>{item.payload?.title || 'Update'}</strong><small>{item.payload?.message || item.template.replaceAll('_', ' ')}</small><time>{new Date(item.createdAt).toLocaleString()}</time></span></button>)}</div> : <p className="notification-empty">No notifications</p>}</section>}</div>;
}

function Header({ view, onNavigate, collapsed, onToggleSidebar, onLogout, riderOnly = false }: { view: View; onNavigate: (view: View) => void; collapsed: boolean; onToggleSidebar: () => void; onLogout: () => void; riderOnly?: boolean }) {
  const title = view === 'dashboard' ? 'Courier dashboard' : view === 'consignments' ? 'All shipments' : view === 'booking' ? 'Create shipment' : view === 'rider' ? 'Rider workspace' : view === 'riders' ? 'Management' : view === 'settings' ? 'Settings' : 'Track shipment';
  return <header className="topbar"><div className="topbar-leading"><button aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'} aria-expanded={!collapsed} className="icon-button sidebar-toggle" onClick={onToggleSidebar} type="button"><Icon name={collapsed ? 'dock_to_right' : 'dock_to_left'} /></button><div className="topbar-title"><span className="eyebrow">OPERATIONS</span><h1>{title}</h1></div></div><div className="topbar-actions">{!riderOnly && <label className="global-search"><Icon name="search" /><input aria-label="Search consignments" placeholder="Search CN or rider" /><kbd>CTRL K</kbd></label>}<button aria-label="Scan QR code" className="icon-button scanner" onClick={() => onNavigate(riderOnly ? 'rider' : 'tracking')} type="button"><Icon name="qr_code_scanner" /></button><NotificationInbox /><button aria-label="Log out" className="icon-button logout-button" title="Log out" onClick={onLogout} type="button"><Icon name="logout" /></button></div></header>;
}

function SessionExpiredDialog({ onConfirm }: { onConfirm: () => void }) {
  return <div className="auth-dialog-backdrop" role="presentation"><section aria-describedby="session-expired-copy" aria-labelledby="session-expired-title" aria-modal="true" className="auth-dialog" role="dialog"><div className="auth-dialog-icon"><Icon name="lock_clock" /></div><span className="eyebrow">SESSION ENDED</span><h2 id="session-expired-title">Please sign in again</h2><p id="session-expired-copy">Your secure session has expired. Sign in again to continue managing dispatches.</p><button autoFocus className="button primary" onClick={onConfirm} type="button">OK, go to login <Icon name="arrow_forward" /></button></section></div>;
}

function MetricCard({ label, value, note, icon, tone = '' }: { label: string; value: string; note: string; icon: string; tone?: string }) {
  return <article className={`metric-card ${tone}`}><div className="metric-top"><span>{label}</span><Icon name={icon} /></div><strong>{value}</strong><small>{note}</small></article>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="state-panel"><div className="state-icon"><Icon name="cloud_off" /></div><h3>{title}</h3><p>{message}</p>{action}</div>;
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [state, setState] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [showIntro, setShowIntro] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowIntro(false), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState('submitting');
    setMessage('');
    try {
      onAuthenticated(await login(String(form.get('email') ?? ''), String(form.get('password') ?? '')));
    } catch (error) {
      setMessage((error as ApiError).message ?? 'Unable to sign in.');
      setState('error');
    }
  }
  if (showIntro) return <main className="rider-intro" aria-label="SwiftLog introduction"><div className="rider-intro-stage"><img className="rider-bike-image" src="/assets/logo.jpg" alt="Delivery rider" /><div className="intro-wordmark">Swift<span>Log</span></div><div className="intro-progress" aria-hidden="true"><i /></div><button className="intro-skip" onClick={() => setShowIntro(false)} type="button">Sign in <Icon name="arrow_forward" /></button></div></main>;
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="login-wordmark">Swift<span>Log</span></div><h1>Sign in</h1><label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>{state === 'error' && <div className="error-callout"><Icon name="error" /><span>{message}</span></div>}<button className="button primary login-submit" disabled={state === 'submitting'} type="submit">{state === 'submitting' ? 'Signing in' : 'Sign in'} <Icon name="arrow_forward" /></button>{state === 'submitting' && <div className="login-loading-overlay" aria-live="polite"><div className="loader-rider"><img className="rider-bike-image" src="/assets/logo.jpg" alt="Delivery rider" /></div><div className="skeleton-stack" aria-hidden="true"><i /><i /><i /></div></div>}</form></main>;
}

function Dashboard({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [state, setState] = useState<'loading' | 'error' | 'empty'>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => { getConsignments('?limit=1').then(() => setState('empty')).catch((requestError: ApiError) => { setError(requestError); setState('error'); }); }, []);
  const connectionLabel = state === 'error' ? 'API unavailable' : state === 'loading' ? 'Checking API' : 'API connected';
  return <div className="page-content"><PageHeader eyebrow="CONTROL ROOM / DXB-01" title="Good morning, Sam" description="Live network posture and delivery performance across your permitted operations scope." action={<button className="button primary" onClick={() => onNavigate('booking')} type="button"><Icon name="add" /> New Booking</button>} /><section className="metric-grid"><MetricCard label="Active Shipments" value="--" note="Awaiting API data" icon="inventory_2" /><MetricCard label="Out for Delivery" value="--" note="Awaiting API data" icon="near_me" tone="blue" /><MetricCard label="Failed Attempts" value="--" note="Requires attention" icon="crisis_alert" tone="danger" /><MetricCard label="COD Unreconciled" value="--" note="Finance scope only" icon="payments" tone="violet" /></section><section className="dashboard-grid"><article className="surface-panel pipeline-panel"><div className="panel-heading"><div><span className="eyebrow">NETWORK FLOW</span><h3>Dispatch pipeline</h3></div><span className="sync-state"><span className="live-dot" /> {connectionLabel}</span></div><div className="pipeline-list">{['Booked', 'Verified', 'Manifested', 'In Transit', 'Received', 'Out for Delivery', 'Delivered'].map((item, index) => <div className="pipeline-row" key={item}><span>{String(index + 1).padStart(2, '0')} {item}</span><div className="bar"><i style={{ width: '0%' }} /></div><strong>--</strong></div>)}</div></article><article className="surface-panel exception-panel"><div className="panel-heading"><div><span className="eyebrow">EXCEPTIONS</span><h3>Action queue</h3></div><span className="status-badge status-failed">LIVE</span></div><EmptyState title={state === 'error' ? 'API unavailable' : state === 'loading' ? 'Loading queue' : 'No exception data'} message={state === 'error' ? error?.message ?? 'The operations API could not be reached.' : state === 'loading' ? 'Checking the authorized operations feed.' : 'No exception records were returned for this scope.'} action={state === 'error' ? <button className="button subtle" onClick={() => window.location.reload()} type="button">Retry connection</button> : undefined} /></article></section><section className="surface-panel live-feed"><div className="panel-heading"><div><span className="eyebrow">LIVE FEED</span><h3>Consignment movement</h3></div><button className="text-button" onClick={() => onNavigate('consignments')} type="button">View all <Icon name="arrow_forward" /></button></div><EmptyState title="Waiting for live consignments" message="This view reads from the NestJS API and will populate when the authorized shipment feed is available." /></section></div>;
}

function RiderHome({ initialCn = '' }: { initialCn?: string }) {
  const [cnNumber, setCnNumber] = useState(initialCn);
  const [dispatch, setDispatch] = useState<RiderScanResult | null>(null);
  const [pickups, setPickups] = useState<PickupAssignment[]>([]);
  const [assignments, setAssignments] = useState<RiderDeliveryAssignment[]>([]);
  const [remarks, setRemarks] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [failingAssignment, setFailingAssignment] = useState<RiderDeliveryAssignment | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loadWork = () => Promise.all([getAssignedPickups(), getMyRiderAssignments()]).then(([pickupRows, assignmentRows]) => { setPickups(pickupRows); setAssignments(assignmentRows); }).catch((error: ApiError) => setMessage(error.message));
  useEffect(() => { void loadWork(); }, []);
  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function openShipment(value: string) {
    setBusy(true); setMessage(''); setCnNumber(value);
    try { setDispatch(await unlockRiderDispatch(value)); }
    catch (error) { setDispatch(null); setMessage((error as ApiError).message ?? 'Unable to open this parcel.'); }
    finally { setBusy(false); }
  }
  async function unlock(event: React.FormEvent) { event.preventDefault(); await openShipment(cnNumber); }
  function closeCamera() { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraOpen(false); }
  async function openCamera() {
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('Camera access is not available in this browser.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream; setCameraOpen(true);
      window.setTimeout(async () => {
        const video = videoRef.current; if (!video) return;
        video.srcObject = stream; await video.play();
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (!Detector) { setMessage('Live QR detection needs Chrome or Edge. You can still enter the parcel code below.'); return; }
        const detector = new Detector({ formats: ['qr_code'] });
        const detect = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const result = await detector.detect(videoRef.current);
            const raw = result[0]?.rawValue ?? '';
            const code = decodeURIComponent(raw).match(/CN-[A-Z0-9-]+/i)?.[0]?.toUpperCase();
            if (code) { closeCamera(); await openShipment(code); return; }
          } catch { /* Continue scanning. */ }
          window.setTimeout(() => void detect(), 250);
        };
        void detect();
      }, 50);
    } catch { setMessage('Camera permission was denied. Allow camera access and try again.'); }
  }
  async function changeStatus(status: RiderStatus) {
    if (!dispatch) return; setBusy(true); setMessage('');
    try {
      const updated = await updateRiderDispatchStatus(dispatch.id, status, remarks || undefined);
      setDispatch({ ...dispatch, status: updated.status, allowedStatuses: updated.allowedStatuses });
      setRemarks(''); setMessage(`Status updated to ${updated.status.replaceAll('_', ' ')}.`); await loadWork();
    } catch (error) { setMessage((error as ApiError).message ?? 'Status could not be updated.'); }
    finally { setBusy(false); }
  }

  async function changeAssignedStatus(consignmentId: string, status: RiderStatus) {
    setBusy(true); setMessage('');
    try {
      const updated = await updateRiderDispatchStatus(consignmentId, status, remarks || undefined);
      setMessage(`Status updated to ${updated.status.replaceAll('_', ' ')}.`);
      setRemarks(''); await loadWork();
    } catch (error) { setMessage((error as ApiError).message ?? 'Status could not be updated.'); }
    finally { setBusy(false); }
  }

  async function viewCustomerPdf(consignmentId: string) {
    setMessage('');
    try { await openDispatchDocument(consignmentId, 'dispatch', 'view'); }
    catch (error) { setMessage((error as ApiError).message ?? 'Customer PDF could not be opened.'); }
  }

  async function completeAssignedDelivery(assignment: RiderDeliveryAssignment) {
    const cashPayment = assignment.consignment.payments.find((payment) => payment.method === 'CASH' && payment.status !== 'VERIFIED');
    const amount = cashPayment ? Number(cashPayment.amount) : undefined;
    if (cashPayment && !window.confirm(`Confirm that you collected ${amount} from the receiver?`)) return;
    setBusy(true); setMessage('');
    try {
      await completeRiderDelivery(assignment.consignment.id, amount, remarks || undefined);
      setRemarks(''); setMessage('Delivery completed successfully.'); await loadWork();
    } catch (error) { setMessage((error as ApiError).message ?? 'Delivery could not be completed.'); }
    finally { setBusy(false); }
  }

  async function submitDeliveryFailure(event: React.FormEvent) {
    event.preventDefault();
    if (!failingAssignment || !failureReason.trim()) return;
    setBusy(true); setMessage('');
    try {
      await failRiderDelivery(failingAssignment.consignment.id, failureReason.trim(), remarks || undefined);
      setFailingAssignment(null); setFailureReason(''); setRemarks('');
      setMessage('Delivery attempt recorded as failed.'); await loadWork();
    } catch (error) { setMessage((error as ApiError).message ?? 'Delivery failure could not be recorded.'); }
    finally { setBusy(false); }
  }

  const assignedParcelActions = assignments.length ? <section className="surface-panel rider-direct-actions">
    <div className="panel-heading"><div><span className="eyebrow">DELIVERY ACTIONS</span><h3>Update assigned parcels</h3></div><small>QR scanning is optional</small></div>
    <label className="field rider-route-remarks"><span>Optional note for the next update</span><input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Receiver contacted, gate closed…" /></label>
    <div className="rider-action-list">{assignments.map((assignment) => {
      const receiver = assignment.consignment.parties.find((party) => party.kind === 'RECEIVER');
      const cashPayment = assignment.consignment.payments.find((payment) => payment.method === 'CASH' && payment.status !== 'VERIFIED');
      return <article key={assignment.id}><div><strong>{receiver?.name || 'Receiver'}</strong><small>{assignment.consignment.cnNumber}</small></div><StatusBadge status={assignment.consignment.status} /><div className="rider-order-actions"><button className="button subtle" disabled={busy} onClick={() => void viewCustomerPdf(assignment.consignment.id)} type="button"><Icon name="picture_as_pdf" /> Customer PDF</button>{assignment.allowedStatuses.filter((status) => status !== 'DELIVERED').map((status) => status === 'DELIVERY_FAILED' ? <button className="button subtle danger" disabled={busy} key={status} onClick={() => { setFailingAssignment(assignment); setFailureReason(''); }} type="button">Delivery failed</button> : <button className="button subtle" disabled={busy} key={status} onClick={() => void changeAssignedStatus(assignment.consignment.id, status)} type="button">Out for delivery</button>)}{assignment.consignment.status === 'OUT_FOR_DELIVERY' && <button className="button primary" disabled={busy} onClick={() => void completeAssignedDelivery(assignment)} type="button"><Icon name="task_alt" /> {cashPayment ? `Complete · collect ${cashPayment.amount}` : 'Complete delivery'}</button>}{assignment.consignment.status === 'DELIVERED' ? <span className="rider-waiting-step">Completed today</span> : !assignment.allowedStatuses.length && <span className="rider-waiting-step">Confirm pickup before changing delivery status</span>}</div></article>;
    })}</div>
  </section> : null;

  if (assignments.length) return <div className="rider-page page-content">
    <PageHeader eyebrow="RIDER / TODAY" title="My deliveries" description="Update any assigned parcel directly. Scan its QR only when that is faster." action={<button className="button primary rider-camera-action" onClick={() => void openCamera()} type="button"><Icon name="qr_code_scanner" /> Scan parcel QR</button>} />
    <section className="rider-metrics"><MetricCard label="Assigned parcels" value={String(assignments.filter((item) => item.status === 'ACTIVE').length)} note="Active workload" icon="package_2" /><MetricCard label="Pickups" value={String(pickups.length)} note="Awaiting collection" icon="inventory" /><MetricCard label="Out for delivery" value={String(assignments.filter((item) => item.consignment.status === 'OUT_FOR_DELIVERY').length)} note="On route" icon="two_wheeler" /><MetricCard label="Completed today" value={String(assignments.filter((item) => item.consignment.status === 'DELIVERED').length)} note="Finished" icon="task_alt" /></section>
    {message && <div className="success-callout">{message}</div>}
    {assignedParcelActions}
    {pickups.length > 0 && <section className="surface-panel rider-pickups"><div className="panel-heading"><div><span className="eyebrow">PICKUPS</span><h3>Collection actions</h3></div></div>{pickups.map((pickup) => { const origin = pickup.consignment.addresses.find((address) => address.kind === 'ORIGIN'); const sender = pickup.consignment.parties.find((party) => party.kind === 'SENDER'); return <div className="rider-directory-row" key={pickup.id}><div><strong>{sender?.name || 'Sender'}</strong><small>{origin?.addressLine}{origin?.city ? `, ${origin.city}` : ''}</small></div><div className="workspace-actions"><button className="button subtle" onClick={() => void startPickup(pickup.id).then(loadWork)}>Start</button><button className="button primary" onClick={() => void completePickup(pickup.id, remarks || undefined).then(() => { setMessage('Pickup confirmed and parcel dispatched.'); void loadWork(); })}>Confirm pickup</button><button className="button subtle" onClick={() => void failPickup(pickup.id, remarks || 'Pickup failed').then(loadWork)}>Failed</button></div></div>; })}</section>}
    {failingAssignment && <div className="rider-action-backdrop"><form className="rider-action-dialog" onSubmit={submitDeliveryFailure}><header><div><span className="eyebrow">DELIVERY ATTEMPT</span><h3>Why could this parcel not be delivered?</h3><small>{failingAssignment.consignment.cnNumber}</small></div><button aria-label="Close" className="icon-button" onClick={() => setFailingAssignment(null)} type="button"><Icon name="close" /></button></header><label className="field"><span>Failure reason</span><select autoFocus onChange={(event) => setFailureReason(event.target.value)} required value={failureReason}><option value="">Select a reason</option><option value="Receiver unavailable">Receiver unavailable</option><option value="Wrong or incomplete address">Wrong or incomplete address</option><option value="Receiver refused parcel">Receiver refused parcel</option><option value="COD payment not available">COD payment not available</option><option value="Access restricted">Access restricted</option><option value="Parcel damaged">Parcel damaged</option><option value="Other operational reason">Other operational reason</option></select></label><div className="workspace-actions"><button className="button subtle" onClick={() => setFailingAssignment(null)} type="button">Cancel</button><button className="button primary" disabled={busy || !failureReason} type="submit">Record failed attempt</button></div></form></div>}
    {cameraOpen && <div className="qr-camera-backdrop"><section className="qr-camera"><header><div><span className="eyebrow">LIVE CAMERA</span><h3>Point at the parcel QR</h3></div><button aria-label="Close camera" className="icon-button" onClick={closeCamera} type="button"><Icon name="close" /></button></header><div className="qr-camera-view"><video ref={videoRef} muted playsInline /><i /><span>Keep the QR inside the frame</span></div></section></div>}
  </div>;

  return <div className="rider-page page-content"><PageHeader eyebrow="RIDER / TODAY" title="My deliveries" description="See every assigned parcel, scan its QR, and update delivery progress." action={<button className="button primary rider-camera-action" onClick={() => void openCamera()} type="button"><Icon name="qr_code_scanner" /> Scan parcel QR</button>} /><section className="rider-metrics"><MetricCard label="Assigned parcels" value={String(assignments.length)} note="Active workload" icon="package_2" /><MetricCard label="Pickups" value={String(pickups.length)} note="Awaiting collection" icon="inventory" /><MetricCard label="Out for delivery" value={String(assignments.filter((item) => item.consignment.status === 'OUT_FOR_DELIVERY').length)} note="On route" icon="two_wheeler" /><MetricCard label="Completed today" value="—" note="Updates live" icon="task_alt" /></section>{message && <div className={dispatch ? 'success-callout' : 'error-callout'}>{message}</div>}<section className="surface-panel rider-orders"><div className="panel-heading"><div><span className="eyebrow">MY ROUTE</span><h3>{assignments.length} parcel{assignments.length === 1 ? '' : 's'} assigned</h3></div></div><div className="rider-order-list">{assignments.map((assignment) => { const receiver = assignment.consignment.parties.find((party) => party.kind === 'RECEIVER'); const destination = assignment.consignment.addresses.find((address) => address.kind === 'DESTINATION'); return <article key={assignment.id}><div className="rider-order-index"><Icon name="package_2" /></div><div><strong>{receiver?.name || 'Receiver'}</strong><span>{destination?.addressLine}{destination?.city ? `, ${destination.city}` : ''}</span><small>{assignment.consignment.cnNumber} · {assignment.consignment.serviceType.replaceAll('_', ' ')}</small></div><StatusBadge status={assignment.consignment.status} /><button className="button subtle" disabled={busy} onClick={() => void openShipment(assignment.consignment.cnNumber)} type="button">Open</button></article>; })}{!assignments.length && <div className="state-panel"><Icon name="check_circle" /><h3>No active parcels</h3><p>New assignments will appear here automatically.</p></div>}</div></section><section className="surface-panel rider-scan-panel"><div className="panel-heading"><div><span className="eyebrow">QUICK LOOKUP</span><h3>Parcel QR</h3></div><button className="button primary" onClick={() => void openCamera()} type="button"><Icon name="photo_camera" /> Open camera</button></div><form onSubmit={unlock}><label className="field"><span>Parcel code fallback</span><input value={cnNumber} onChange={(event) => setCnNumber(event.target.value.toUpperCase())} placeholder="CN-..." required /></label><button className="button subtle" disabled={busy} type="submit">{busy ? 'Opening…' : 'Open parcel'}</button></form>{dispatch && <div className="rider-unlocked"><div className="panel-heading"><h3>{dispatch.cnNumber}</h3><StatusBadge status={dispatch.status} /></div><label className="field"><span>Optional remarks</span><input value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><div className="workspace-actions">{dispatch.allowedStatuses.map((status) => <button className={status === 'DELIVERED' ? 'button primary' : 'button subtle'} disabled={busy} key={status} onClick={() => void changeStatus(status)} type="button">{status === 'OUT_FOR_DELIVERY' ? 'Out for delivery' : status === 'DELIVERED' ? 'Delivered' : 'Delivery failed'}</button>)}</div></div>}</section>{pickups.length > 0 && <section className="surface-panel rider-pickups"><div className="panel-heading"><div><span className="eyebrow">PICKUPS</span><h3>Collection actions</h3></div></div>{pickups.map((pickup) => { const origin = pickup.consignment.addresses.find((address) => address.kind === 'ORIGIN'); const sender = pickup.consignment.parties.find((party) => party.kind === 'SENDER'); return <div className="rider-directory-row" key={pickup.id}><div><strong>{sender?.name || 'Sender'}</strong><small>{origin?.addressLine}{origin?.city ? `, ${origin.city}` : ''}</small></div><div className="workspace-actions"><button className="button subtle" onClick={() => void startPickup(pickup.id).then(loadWork)}>Start</button><button className="button primary" onClick={() => void completePickup(pickup.id, remarks || undefined).then(() => { setMessage('Pickup confirmed and parcel dispatched.'); void loadWork(); })}>Confirm pickup</button><button className="button subtle" onClick={() => void failPickup(pickup.id, remarks || 'Pickup failed').then(loadWork)}>Failed</button></div></div>; })}</section>}{cameraOpen && <div className="qr-camera-backdrop"><section className="qr-camera"><header><div><span className="eyebrow">LIVE CAMERA</span><h3>Point at the parcel QR</h3></div><button aria-label="Close camera" className="icon-button" onClick={closeCamera} type="button"><Icon name="close" /></button></header><div className="qr-camera-view"><video ref={videoRef} muted playsInline /><i /><span>Keep the QR inside the frame</span></div></section></div>}</div>;
}

function Consignments({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [search, setSearch] = useState('');
  return <div className="page-content"><PageHeader eyebrow="OPERATIONS / SHIPMENTS" title="Consignments" description="Search, filter, and inspect shipments within your authorized organization and location scope." action={<button className="button primary" onClick={() => onNavigate('booking')} type="button"><Icon name="add" /> New Booking</button>} /><div className="filter-bar"><label className="filter-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search CN, AWB, phone, consignee..." /><kbd>ENTER</kbd></label><select aria-label="Status filter" defaultValue="ALL"><option value="ALL">All statuses</option><option value="BOOKED">Booked</option><option value="IN_TRANSIT">In transit</option><option value="OUT_FOR_DELIVERY">Out for delivery</option><option value="DELIVERED">Delivered</option></select><select aria-label="Payment filter" defaultValue="ALL"><option value="ALL">All payments</option><option value="COD">COD only</option><option value="PENDING">Pending</option></select><button className="button subtle" type="button"><Icon name="tune" /> Filters</button></div><div className="status-tabs"><button className="active" type="button">All <b>--</b></button>{['Booked', 'In Transit', 'Out for Delivery', 'Failed', 'Delivered', 'RTO'].map((status) => <button key={status} type="button">{status} <b>--</b></button>)}</div><div className="surface-panel table-panel"><div className="table-toolbar"><span className="eyebrow">AUTHORIZED RESULTS</span><div className="toolbar-actions"><button className="button subtle" type="button"><Icon name="file_download" /> Export</button><button className="button subtle" type="button"><Icon name="picture_as_pdf" /> PDF</button></div></div><div className="table-wrap"><table><thead><tr><th>CN NUMBER</th><th>ROUTE</th><th>RECIPIENT</th><th>SERVICE</th><th>COD</th><th>STATUS</th><th /></tr></thead><tbody><tr><td colSpan={7}><EmptyState title="No consignments loaded" message={search ? `No authorized shipment matched “${search}”.` : 'The backend shipment endpoint is not available yet. No sample records are shown.'} action={<button className="button subtle" onClick={() => onNavigate('booking')} type="button"><Icon name="add" /> Create booking</button>} /></td></tr></tbody></table></div></div></div>;
}

function LegacyBooking({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<{ cnNumber?: string; message?: string }>({});
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState('submitting');
    const form = new FormData(event.currentTarget);
    try {
      const response = await createConsignment({
        serviceType: String(form.get('serviceType') ?? 'EXPRESS'),
        parties: [{ kind: 'SENDER', name: String(form.get('senderName') ?? 'Sender'), phone: String(form.get('senderPhone') ?? '') }, { kind: 'RECEIVER', name: String(form.get('receiverName') ?? ''), phone: String(form.get('receiverPhone') ?? '') }],
        addresses: [{ kind: 'ORIGIN', addressLine: String(form.get('originAddress') ?? '') }, { kind: 'DESTINATION', addressLine: String(form.get('destinationAddress') ?? ''), deliveryNote: String(form.get('deliveryNote') ?? '') }],
        packages: [{ packageNumber: 1, physicalWeight: Number(form.get('weight') ?? 0), lengthCm: Number(form.get('length') ?? 0), widthCm: Number(form.get('width') ?? 0), heightCm: Number(form.get('height') ?? 0) }],
      });
      setResult({ cnNumber: response.cnNumber });
      setState('success');
    } catch (error) {
      setResult({ message: (error as ApiError).message ?? 'Dispatch could not be created.' });
      setState('error');
    }
  }
  return <div className="page-content"><PageHeader eyebrow="OPERATIONS / BOOKING" title="Express docket intake" description="Create a shipment through the backend booking command. CN generation, pricing, and validation remain server-authoritative." action={<span className="live-badge"><span className="live-dot" /> LIVE DOCKET</span>} /><div className="step-strip">{['Sender', 'Consignee', 'Service', 'Package', 'Payment', 'Confirm'].map((step, index) => <div className={index === 0 ? 'current' : ''} key={step}><b>{String(index + 1).padStart(2, '0')}</b><span>{step}</span></div>)}</div><div className="booking-grid"><form className="surface-panel booking-form" onSubmit={submit}><SectionHeading number="01" title="Sender and origin" /><div className="form-grid"><Field name="senderName" label="Contact name" placeholder="Sender name" /><Field name="senderPhone" label="Origin phone" placeholder="+971501234567" /><Field name="originAddress" label="Pickup location" placeholder="Branch / hub location" wide /></div><SectionHeading number="02" title="Consignee and destination" /><div className="form-grid"><Field name="receiverName" label="Receiver full name" placeholder="Required" /><Field name="receiverPhone" label="Mobile number" placeholder="+971501234567" /><Field name="destinationAddress" label="Delivery address" placeholder="Street, building, zone" wide /><Field name="deliveryNote" label="Driver notes" placeholder="Gate code or delivery notes" wide /></div><SectionHeading number="03" title="Package and service" /><div className="form-grid"><Field name="weight" label="Dead weight (kg)" placeholder="0.0" type="number" /><Field name="length" label="Length (cm)" placeholder="0" type="number" /><Field name="width" label="Width (cm)" placeholder="0" type="number" /><Field name="height" label="Height (cm)" placeholder="0" type="number" /><label className="field"><span>Service type</span><select name="serviceType" aria-label="Service type"><option value="EXPRESS">Express same-day</option><option value="STANDARD">Standard next-day</option><option value="COLD_CHAIN">Cold chain</option></select></label></div>{state === 'success' && <div className="success-callout"><Icon name="verified" /><span>Booking created. CN <strong>{result.cnNumber}</strong> was generated by the backend.</span></div>}{state === 'error' && <div className="error-callout"><Icon name="error" /><span>{result.message}</span></div>}<div className="form-actions"><button className="button subtle" onClick={() => onNavigate('dashboard')} type="button">Cancel</button><button className="button primary" disabled={state === 'submitting'} type="submit">{state === 'submitting' ? 'Creating booking...' : 'Save booking'} <Icon name="arrow_forward" /></button></div></form><aside className="booking-aside"><div className="surface-panel summary-panel"><span className="eyebrow">BOOKING SUMMARY</span><h3>CN will be generated by the API</h3><p>No authoritative consignment number or price is created in the browser.</p><div className="summary-line"><span>Chargeable weight</span><strong>--</strong></div><div className="summary-line"><span>Estimated charge</span><strong>--</strong></div><div className="summary-line"><span>Payment terms</span><strong>Not selected</strong></div></div><div className="info-callout"><Icon name="verified_user" /><span>Booking permissions, organization scope, and pricing rules are validated on the server.</span></div></aside></div></div>;
}

function Booking({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [createdCn, setCreatedCn] = useState('');
  if (createdCn) return <div className="page-content"><div className="surface-panel workspace-placeholder"><div className="workspace-icon"><Icon name="verified" /></div><h3>Dispatch created</h3><p>The permanent dispatch number is <strong>{createdCn}</strong>.</p><div className="workspace-actions"><button className="button primary" onClick={() => onNavigate('consignments')} type="button">View dispatches</button><button className="button subtle" onClick={() => setCreatedCn('')} type="button">Create another</button></div></div></div>;
  return <DispatchCreate onDone={setCreatedCn} onCancel={() => onNavigate('dashboard')} />;
}

function SectionHeading({ number, title }: { number: string; title: string }) { return <div className="section-heading"><span>{number}</span><h3>{title}</h3></div>; }
function Field({ name, label, placeholder, wide, type = 'text' }: { name?: string; label: string; placeholder: string; wide?: boolean; type?: string }) { return <label className={wide ? 'field wide' : 'field'}><span>{label}</span><input name={name} placeholder={placeholder} type={type} /></label>; }

function OperationalView({ view }: { view: View }) {
  const labels: Record<View, [string, string, string, string]> = { tracking: ['Tracking and reports', 'Authorized visibility across movement, payment, and document records.', 'timeline', 'The API-backed operational view will appear here when its endpoint is available.'], manifest: ['Manifest management', 'Create, scan, dispatch, receive, and reconcile operational manifests.', 'receipt_long', 'Manifest commands are server-controlled and will be connected here.'], rider: ['Rider operations', 'Manage rider availability, assignments, performance, and collections.', 'two_wheeler', 'Rider data will be loaded from the authorized API scope.'], riders: ['Rider management', 'Create and manage rider accounts.', 'manage_accounts', 'Rider management is restricted to administrators.'], settings: ['Settings', 'Configure appearance and staff access.', 'settings', 'Settings are restricted to administrators.'], dashboard: ['', '', '', ''], consignments: ['', '', '', ''], booking: ['', '', '', ''] };
  const [title, description, icon, message] = labels[view];
  return <div className="page-content"><PageHeader eyebrow="OPERATIONS / WORKSPACE" title={title} description={description} /><div className="surface-panel workspace-placeholder"><div className="workspace-icon"><Icon name={icon} /></div><h3>{title} is ready for API integration</h3><p>{message}</p><div className="workspace-actions"><button className="button subtle" type="button"><Icon name="filter_alt" /> Configure filters</button><button className="button subtle" type="button"><Icon name="picture_as_pdf" /> Request PDF</button></div><div className="permission-note"><Icon name="lock" /> Backend permissions remain authoritative. This screen will never infer access from hidden buttons.</div></div></div>;
}

export default function OperationsShell() {
  const [view, setView] = useState<View>('dashboard');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [scannedCn, setScannedCn] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshTimer = useRef<number | null>(null);
  useEffect(() => {
    const savedTheme = localStorage.getItem('swiftlog-theme') || 'light';
    document.documentElement.dataset.theme = savedTheme;
    const url = new URL(window.location.href);
    const scan = url.searchParams.get('scan');
    if (scan) { setScannedCn(scan); setView('rider'); }
    if (url.searchParams.has('email') || url.searchParams.has('password')) {
      url.searchParams.delete('email');
      url.searchParams.delete('password');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  useEffect(() => setSession(getSession()), []);
  useEffect(() => {
    const handleSessionExpired = () => setSessionExpired(true);
    window.addEventListener(sessionExpiredEvent, handleSessionExpired);
    return () => window.removeEventListener(sessionExpiredEvent, handleSessionExpired);
  }, []);
  useEffect(() => {
    const refreshWorkspace = () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        setRefreshVersion((version) => version + 1);
        refreshTimer.current = null;
      }, 100);
    };
    window.addEventListener(dataChangedEvent, refreshWorkspace);
    return () => {
      window.removeEventListener(dataChangedEvent, refreshWorkspace);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const expiresAt = getAccessTokenExpiry(session.accessToken);
    if (!expiresAt) return;
    const timer = window.setTimeout(() => setSessionExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [session]);
  useEffect(() => { if (session?.user.roles.length === 1 && session.user.roles.includes('RIDER')) setView('rider'); }, [session]);
  async function handleLogout() {
    await logout();
    setSession(null);
  }
  function confirmExpiredSession() {
    setSessionExpired(false);
    void logout().finally(() => setSession(null));
  }
  if (!session) return <LoginScreen onAuthenticated={(authenticated) => { setSessionExpired(false); setSession(authenticated); }} />;
  const riderOnly = session.user.roles.length === 1 && session.user.roles.includes('RIDER');
  const content = view === 'dashboard' ? <DispatchDashboard onCreate={() => setView('booking')} onViewAll={() => setView('consignments')} /> : view === 'consignments' ? <DispatchList onCreate={() => setView('booking')} /> : view === 'booking' ? <Booking onNavigate={setView} /> : view === 'rider' ? <RiderHome initialCn={scannedCn} /> : view === 'riders' ? <RiderManagement /> : view === 'settings' ? <SettingsPanel appearanceOnly={riderOnly} /> : <TrackingView />;
  return <div className={`app-shell ${riderOnly ? 'rider-only-shell' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}><a className="skip-link" href="#main-content">Skip to operations</a><Sidebar activeView={view} onNavigate={setView} user={session.user} collapsed={sidebarCollapsed} /><main className="main-column" id="main-content"><Header view={view} onNavigate={setView} collapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((value) => !value)} onLogout={() => void handleLogout()} riderOnly={riderOnly} /><Fragment key={`${view}-${refreshVersion}`}>{content}</Fragment></main><MobileNavigation activeView={view} onNavigate={setView} riderOnly={riderOnly} />{sessionExpired && <SessionExpiredDialog onConfirm={confirmExpiredSession} />}<Link className="sr-only" href="/">SwiftLog Dispatch Operations</Link></div>;
}
