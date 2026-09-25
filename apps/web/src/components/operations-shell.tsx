'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createConsignment, getConsignments, type ApiError } from '../lib/api';

type View = 'dashboard' | 'consignments' | 'booking' | 'manifest' | 'tracking' | 'rider';

type NavItem = { label: string; icon: string; view: View; permission?: string };
type NavGroup = { label: string; items: NavItem[] };

const navigation: NavGroup[] = [
  { label: 'Dashboard', items: [{ label: 'Operations', icon: 'speed', view: 'dashboard' }] },
  {
    label: 'Operations',
    items: [
      { label: 'Consignments', icon: 'inventory_2', view: 'consignments', permission: 'shipment:view' },
      { label: 'Booking', icon: 'add_box', view: 'booking', permission: 'shipment:create' },
      { label: 'Tracking', icon: 'timeline', view: 'tracking', permission: 'shipment:view' },
      { label: 'Manifests', icon: 'receipt_long', view: 'manifest', permission: 'manifest:view' },
      { label: 'Pickup', icon: 'hail', view: 'tracking', permission: 'pickup:view' },
      { label: 'Transit', icon: 'route', view: 'manifest', permission: 'transit:view' },
      { label: 'Delivery', icon: 'local_shipping', view: 'rider', permission: 'delivery:view' },
      { label: 'Returns / RTO', icon: 'keyboard_return', view: 'tracking', permission: 'return:view' },
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Branches', icon: 'store', view: 'tracking' },
      { label: 'Hubs', icon: 'warehouse', view: 'manifest' },
      { label: 'Riders', icon: 'two_wheeler', view: 'rider', permission: 'delivery:assign' },
      { label: 'Customers', icon: 'groups', view: 'tracking', permission: 'customer:view' },
      { label: 'Routes', icon: 'alt_route', view: 'tracking', permission: 'route:view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Payments', icon: 'payments', view: 'tracking', permission: 'payment:view' },
      { label: 'COD & Settlements', icon: 'account_balance_wallet', view: 'tracking', permission: 'payment:view' },
    ],
  },
  { label: 'Reports', items: [{ label: 'Reports & Documents', icon: 'description', view: 'tracking', permission: 'report:view' }] },
  { label: 'Administration', items: [{ label: 'Users & Roles', icon: 'admin_panel_settings', view: 'tracking', permission: 'user:view' }, { label: 'Audit & Settings', icon: 'manage_accounts', view: 'tracking', permission: 'audit:view' }] },
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

function Sidebar({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><Icon name="local_shipping" /></div>
        <div><strong>SwiftLog OS</strong><span>Dispatch Core</span></div>
      </div>
      <div className="hub-context"><span className="live-dot" /> CENTRAL HUB <b>DXB-01</b></div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigation.map((group) => (
          <section key={group.label} className="nav-group">
            <span className="nav-label">{group.label}</span>
            {group.items.map((item) => (
              <button key={item.label} className={`nav-item ${activeView === item.view ? 'active' : ''}`} onClick={() => onNavigate(item.view)} type="button">
                <Icon name={item.icon} /><span>{item.label}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>
      <div className="sidebar-footer"><div className="avatar">SM</div><div><strong>Sam Malik</strong><span>Operations Manager</span></div><button aria-label="Settings" className="icon-button" type="button"><Icon name="settings" /></button></div>
    </aside>
  );
}

function MobileNavigation({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  const items: Array<[View, string, string]> = [['dashboard', 'speed', 'Home'], ['consignments', 'inventory_2', 'Shipments'], ['booking', 'add_circle', 'Book'], ['manifest', 'qr_code_scanner', 'Scan'], ['rider', 'person', 'Profile']];
  return <nav className="mobile-nav" aria-label="Mobile navigation">{items.map(([view, icon, label]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => onNavigate(view)} type="button"><Icon name={icon} /><span>{label}</span></button>)}</nav>;
}

function Header({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const title = view === 'dashboard' ? 'Operations Dashboard' : view === 'consignments' ? 'Consignments' : view === 'booking' ? 'New Shipment Booking' : view === 'manifest' ? 'Manifest Management' : view === 'rider' ? 'Rider Operations' : 'Tracking & Operations';
  return <header className="topbar"><div className="topbar-title"><span className="eyebrow">OPERATIONS / LIVE CONTROL</span><h1>{title}</h1></div><div className="topbar-actions"><label className="global-search"><Icon name="search" /><input aria-label="Search consignments" placeholder="Search CN, manifest, rider..." /><kbd>⌘ K</kbd></label><button aria-label="Scan barcode" className="icon-button scanner" onClick={() => onNavigate('manifest')} type="button"><Icon name="barcode_scanner" /></button><button aria-label="Notifications" className="icon-button notification" type="button"><Icon name="notifications" /><span>3</span></button><div className="avatar">SM</div></div></header>;
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

function Dashboard({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [state, setState] = useState<'loading' | 'error' | 'empty'>('loading');
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => { getConsignments('?limit=1').then(() => setState('empty')).catch((requestError: ApiError) => { setError(requestError); setState('error'); }); }, []);
  const connectionLabel = state === 'error' ? 'API unavailable' : state === 'loading' ? 'Checking API' : 'API connected';
  return <div className="page-content"><PageHeader eyebrow="CONTROL ROOM / DXB-01" title="Good morning, Sam" description="Live network posture and delivery performance across your permitted operations scope." action={<button className="button primary" onClick={() => onNavigate('booking')} type="button"><Icon name="add" /> New Booking</button>} /><section className="metric-grid"><MetricCard label="Active Shipments" value="--" note="Awaiting API data" icon="inventory_2" /><MetricCard label="Out for Delivery" value="--" note="Awaiting API data" icon="near_me" tone="blue" /><MetricCard label="Failed Attempts" value="--" note="Requires attention" icon="crisis_alert" tone="danger" /><MetricCard label="COD Unreconciled" value="--" note="Finance scope only" icon="payments" tone="violet" /></section><section className="dashboard-grid"><article className="surface-panel pipeline-panel"><div className="panel-heading"><div><span className="eyebrow">NETWORK FLOW</span><h3>Dispatch pipeline</h3></div><span className="sync-state"><span className="live-dot" /> {connectionLabel}</span></div><div className="pipeline-list">{['Booked', 'Verified', 'Manifested', 'In Transit', 'Received', 'Out for Delivery', 'Delivered'].map((item, index) => <div className="pipeline-row" key={item}><span>{String(index + 1).padStart(2, '0')} {item}</span><div className="bar"><i style={{ width: '0%' }} /></div><strong>--</strong></div>)}</div></article><article className="surface-panel exception-panel"><div className="panel-heading"><div><span className="eyebrow">EXCEPTIONS</span><h3>Action queue</h3></div><span className="status-badge status-failed">LIVE</span></div><EmptyState title={state === 'error' ? 'API unavailable' : state === 'loading' ? 'Loading queue' : 'No exception data'} message={state === 'error' ? error?.message ?? 'The operations API could not be reached.' : state === 'loading' ? 'Checking the authorized operations feed.' : 'No exception records were returned for this scope.'} action={state === 'error' ? <button className="button subtle" onClick={() => window.location.reload()} type="button">Retry connection</button> : undefined} /></article></section><section className="surface-panel live-feed"><div className="panel-heading"><div><span className="eyebrow">LIVE FEED</span><h3>Consignment movement</h3></div><button className="text-button" onClick={() => onNavigate('consignments')} type="button">View all <Icon name="arrow_forward" /></button></div><EmptyState title="Waiting for live consignments" message="This view reads from the NestJS API and will populate when the authorized shipment feed is available." /></section></div>;
}

function RiderHome({ onNavigate }: { onNavigate: (view: View) => void }) {
  return <div className="rider-page"><PageHeader eyebrow="RIDER APP / TODAY" title="Good morning, rider" description="Your assigned route, delivery attempts, and COD collection status." /><div className="rider-hero"><div><span className="eyebrow">ACTIVE ROUTE</span><h3>Scan-first delivery workflow</h3><p>Scan a CN to ask the backend whether this shipment is assigned to you and what operation is allowed.</p></div><button className="scan-button" onClick={() => onNavigate('manifest')} type="button"><Icon name="barcode_scanner" /><span>SCAN CN</span></button></div><div className="rider-metrics"><MetricCard label="Today's deliveries" value="--" note="Awaiting assignment feed" icon="inventory_2" /><MetricCard label="Pending" value="--" note="Authorized route only" icon="pending_actions" tone="blue" /><MetricCard label="Completed" value="--" note="Server-confirmed" icon="task_alt" tone="blue" /><MetricCard label="COD to hand over" value="--" note="Finance scope only" icon="payments" tone="violet" /></div><div className="surface-panel rider-flow"><div className="panel-heading"><div><span className="eyebrow">DELIVERY FLOW</span><h3>Secure completion sequence</h3></div><span className="status-badge status-neutral">BACKEND CONTROLLED</span></div><div className="rider-steps">{[['barcode_scanner', 'Scan CN'], ['verified_user', 'Assignment check'], ['pin', 'Receiver OTP'], ['payments', 'Payment'], ['task_alt', 'Complete']].map(([icon, label], index) => <div key={label}><b>{index + 1}</b><Icon name={icon} /><span>{label}</span></div>)}</div><div className="info-callout"><Icon name="lock" /><span>A barcode identifies a shipment only. It never authorizes delivery or reveals another rider's shipment.</span></div></div></div>;
}

function Consignments({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [search, setSearch] = useState('');
  return <div className="page-content"><PageHeader eyebrow="OPERATIONS / SHIPMENTS" title="Consignments" description="Search, filter, and inspect shipments within your authorized organization and location scope." action={<button className="button primary" onClick={() => onNavigate('booking')} type="button"><Icon name="add" /> New Booking</button>} /><div className="filter-bar"><label className="filter-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search CN, AWB, phone, consignee..." /><kbd>ENTER</kbd></label><select aria-label="Status filter" defaultValue="ALL"><option value="ALL">All statuses</option><option value="BOOKED">Booked</option><option value="IN_TRANSIT">In transit</option><option value="OUT_FOR_DELIVERY">Out for delivery</option><option value="DELIVERED">Delivered</option></select><select aria-label="Payment filter" defaultValue="ALL"><option value="ALL">All payments</option><option value="COD">COD only</option><option value="PENDING">Pending</option></select><button className="button subtle" type="button"><Icon name="tune" /> Filters</button></div><div className="status-tabs"><button className="active" type="button">All <b>--</b></button>{['Booked', 'In Transit', 'Out for Delivery', 'Failed', 'Delivered', 'RTO'].map((status) => <button key={status} type="button">{status} <b>--</b></button>)}</div><div className="surface-panel table-panel"><div className="table-toolbar"><span className="eyebrow">AUTHORIZED RESULTS</span><div className="toolbar-actions"><button className="button subtle" type="button"><Icon name="file_download" /> Export</button><button className="button subtle" type="button"><Icon name="picture_as_pdf" /> PDF</button></div></div><div className="table-wrap"><table><thead><tr><th>CN NUMBER</th><th>ROUTE</th><th>RECIPIENT</th><th>SERVICE</th><th>COD</th><th>STATUS</th><th /></tr></thead><tbody><tr><td colSpan={7}><EmptyState title="No consignments loaded" message={search ? `No authorized shipment matched “${search}”.` : 'The backend shipment endpoint is not available yet. No sample records are shown.'} action={<button className="button subtle" onClick={() => onNavigate('booking')} type="button"><Icon name="add" /> Create booking</button>} /></td></tr></tbody></table></div></div></div>;
}

function Booking({ onNavigate }: { onNavigate: (view: View) => void }) {
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
      setResult({ message: (error as ApiError).message ?? 'Booking could not be created.' });
      setState('error');
    }
  }
  return <div className="page-content"><PageHeader eyebrow="OPERATIONS / BOOKING" title="Express docket intake" description="Create a shipment through the backend booking command. CN generation, pricing, and validation remain server-authoritative." action={<span className="live-badge"><span className="live-dot" /> LIVE DOCKET</span>} /><div className="step-strip">{['Sender', 'Consignee', 'Service', 'Package', 'Payment', 'Confirm'].map((step, index) => <div className={index === 0 ? 'current' : ''} key={step}><b>{String(index + 1).padStart(2, '0')}</b><span>{step}</span></div>)}</div><div className="booking-grid"><form className="surface-panel booking-form" onSubmit={submit}><SectionHeading number="01" title="Sender and origin" /><div className="form-grid"><Field name="senderName" label="Contact name" placeholder="Sender name" /><Field name="senderPhone" label="Origin phone" placeholder="+971501234567" /><Field name="originAddress" label="Pickup location" placeholder="Branch / hub location" wide /></div><SectionHeading number="02" title="Consignee and destination" /><div className="form-grid"><Field name="receiverName" label="Receiver full name" placeholder="Required" /><Field name="receiverPhone" label="Mobile number" placeholder="+971501234567" /><Field name="destinationAddress" label="Delivery address" placeholder="Street, building, zone" wide /><Field name="deliveryNote" label="Driver notes" placeholder="Gate code or delivery notes" wide /></div><SectionHeading number="03" title="Package and service" /><div className="form-grid"><Field name="weight" label="Dead weight (kg)" placeholder="0.0" type="number" /><Field name="length" label="Length (cm)" placeholder="0" type="number" /><Field name="width" label="Width (cm)" placeholder="0" type="number" /><Field name="height" label="Height (cm)" placeholder="0" type="number" /><label className="field"><span>Service type</span><select name="serviceType" aria-label="Service type"><option value="EXPRESS">Express same-day</option><option value="STANDARD">Standard next-day</option><option value="COLD_CHAIN">Cold chain</option></select></label></div>{state === 'success' && <div className="success-callout"><Icon name="verified" /><span>Booking created. CN <strong>{result.cnNumber}</strong> was generated by the backend.</span></div>}{state === 'error' && <div className="error-callout"><Icon name="error" /><span>{result.message}</span></div>}<div className="form-actions"><button className="button subtle" onClick={() => onNavigate('dashboard')} type="button">Cancel</button><button className="button primary" disabled={state === 'submitting'} type="submit">{state === 'submitting' ? 'Creating booking...' : 'Save booking'} <Icon name="arrow_forward" /></button></div></form><aside className="booking-aside"><div className="surface-panel summary-panel"><span className="eyebrow">BOOKING SUMMARY</span><h3>CN will be generated by the API</h3><p>No authoritative consignment number or price is created in the browser.</p><div className="summary-line"><span>Chargeable weight</span><strong>--</strong></div><div className="summary-line"><span>Estimated charge</span><strong>--</strong></div><div className="summary-line"><span>Payment terms</span><strong>Not selected</strong></div></div><div className="info-callout"><Icon name="verified_user" /><span>Booking permissions, organization scope, and pricing rules are validated on the server.</span></div></aside></div></div>;
}

function SectionHeading({ number, title }: { number: string; title: string }) { return <div className="section-heading"><span>{number}</span><h3>{title}</h3></div>; }
function Field({ name, label, placeholder, wide, type = 'text' }: { name?: string; label: string; placeholder: string; wide?: boolean; type?: string }) { return <label className={wide ? 'field wide' : 'field'}><span>{label}</span><input name={name} placeholder={placeholder} type={type} /></label>; }

function OperationalView({ view }: { view: View }) {
  const labels: Record<View, [string, string, string, string]> = { tracking: ['Tracking and reports', 'Authorized visibility across movement, payment, and document records.', 'timeline', 'The API-backed operational view will appear here when its endpoint is available.'], manifest: ['Manifest management', 'Create, scan, dispatch, receive, and reconcile operational manifests.', 'receipt_long', 'Manifest commands are server-controlled and will be connected here.'], rider: ['Rider operations', 'Manage rider availability, assignments, performance, and collections.', 'two_wheeler', 'Rider data will be loaded from the authorized API scope.'], dashboard: ['', '', '', ''], consignments: ['', '', '', ''], booking: ['', '', '', ''] };
  const [title, description, icon, message] = labels[view];
  return <div className="page-content"><PageHeader eyebrow="OPERATIONS / WORKSPACE" title={title} description={description} /><div className="surface-panel workspace-placeholder"><div className="workspace-icon"><Icon name={icon} /></div><h3>{title} is ready for API integration</h3><p>{message}</p><div className="workspace-actions"><button className="button subtle" type="button"><Icon name="filter_alt" /> Configure filters</button><button className="button subtle" type="button"><Icon name="picture_as_pdf" /> Request PDF</button></div><div className="permission-note"><Icon name="lock" /> Backend permissions remain authoritative. This screen will never infer access from hidden buttons.</div></div></div>;
}

export default function OperationsShell() {
  const [view, setView] = useState<View>('dashboard');
  const content = view === 'dashboard' ? <Dashboard onNavigate={setView} /> : view === 'consignments' ? <Consignments onNavigate={setView} /> : view === 'booking' ? <Booking onNavigate={setView} /> : view === 'rider' ? <RiderHome onNavigate={setView} /> : <OperationalView view={view} />;
  return <div className="app-shell"><Sidebar activeView={view} onNavigate={setView} /><main className="main-column"><Header view={view} onNavigate={setView} />{content}</main><MobileNavigation activeView={view} onNavigate={setView} /><Link className="sr-only" href="/">Courier Operations</Link></div>;
}
