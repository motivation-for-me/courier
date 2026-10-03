'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  correctDispatchStatus,
  createBranchStaff,
  createCustomer,
  createRider,
  createShopUser,
  deleteBranchStaff,
  deleteCustomer,
  deleteDispatch,
  deleteRider,
  getConsignments,
  getCustomers,
  getRiders,
  getShopUsers,
  getShopFinancialSummary,
  getShopPricing,
  getStaff,
  saveShopBranch,
  saveShopPricing,
  updateBranchStaff,
  updateCustomer,
  updateRider,
  type ApiError,
  type CustomerOption,
  type DispatchSummary,
  type RiderOption,
  type ShopUserOption,
  type ShopFinancialSummary,
  type ShopPricingAgreement,
  type StaffOption,
} from '../lib/api';

type Resource = 'shops' | 'staff' | 'riders' | 'shipments';
const resources: Array<{ id: Resource; icon: string; title: string; note: string }> = [
  { id: 'shops', icon: 'storefront', title: 'Shops', note: 'Sender and pickup address' },
  { id: 'staff', icon: 'badge', title: 'Staff', note: 'Company operators' },
  { id: 'riders', icon: 'two_wheeler', title: 'Riders', note: 'Pickup and delivery team' },
  { id: 'shipments', icon: 'package_2', title: 'Shipments', note: 'Correct or remove records' },
];
const shipmentStatuses = ['DRAFT', 'CONFIRMED', 'ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED'];

function Icon({ name }: { name: string }) { return <span aria-hidden="true" className="material-symbols-outlined icon">{name}</span>; }
function field(form: FormData, name: string) { return String(form.get(name) ?? '').trim(); }

export function RiderManagement() {
  const [active, setActive] = useState<Resource>('shops');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [viewOnly, setViewOnly] = useState(true);
  const [shopSection, setShopSection] = useState<'profile' | 'access' | 'financials'>('profile');
  const [deleteArmed, setDeleteArmed] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [shops, setShops] = useState<CustomerOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [shipments, setShipments] = useState<DispatchSummary[]>([]);
  const [shopUsers, setShopUsers] = useState<ShopUserOption[]>([]);
  const [shopPricing, setShopPricing] = useState<ShopPricingAgreement | null>(null);

  async function load() {
    try {
      const [shopRows, staffRows, riderRows, shipmentRows] = await Promise.all([getCustomers(), getStaff(), getRiders(), getConsignments()]);
      setShops(shopRows); setStaff(staffRows); setRiders(riderRows); setShipments(shipmentRows);
    } catch (error) { setMessage((error as ApiError).message); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { setSelectedId(''); setSearch(''); setViewOnly(true); setShopSection('profile'); setDeleteArmed(''); setMessage(''); }, [active]);

  const selectedShop = useMemo(() => shops.find((item) => item.id === selectedId), [shops, selectedId]);
  const selectedStaff = useMemo(() => staff.find((item) => item.id === selectedId), [staff, selectedId]);
  const selectedRider = useMemo(() => riders.find((item) => item.id === selectedId), [riders, selectedId]);
  const selectedShipment = useMemo(() => shipments.find((item) => item.id === selectedId), [shipments, selectedId]);
  useEffect(() => { if (selectedShop) { getShopUsers(selectedShop.id).then(setShopUsers).catch((error: ApiError) => setMessage(error.message)); getShopPricing(selectedShop.id).then((agreements) => setShopPricing(agreements.find((item) => !item.effectiveTo) ?? agreements[0] ?? null)).catch(() => setShopPricing(null)); } else { setShopUsers([]); setShopPricing(null); } }, [selectedShop]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await action(); setMessage(success); setSelectedId(''); setDeleteArmed(''); await load(); }
    catch (error) { setMessage((error as ApiError).message || 'The operation could not be completed.'); }
    finally { setBusy(false); }
  }

  async function saveShop(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run(async () => {
      const shop = selectedShop ? await updateCustomer(selectedShop.id, { name: field(form, 'name') }) : await createCustomer({ name: field(form, 'name') });
      await saveShopBranch(shop.id, { label: field(form, 'branchLabel'), addressLine: field(form, 'addressLine'), city: field(form, 'city') || undefined });
      await saveShopPricing(shop.id, { currencyCode: shopPricing?.currencyCode ?? 'PKR', shipmentCharge: Number(field(form, 'deliveryFee') || 0), codFeeFixed: Number(shopPricing?.codFeeFixed ?? 0), codFeePercent: Number(shopPricing?.codFeePercent ?? 0), returnCharge: Number(shopPricing?.returnCharge ?? 0), deductChargesFromCod: shopPricing?.deductChargesFromCod ?? true });
    }, selectedShop ? 'Shop updated.' : 'Shop created.');
  }

  async function saveStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const common = { displayName: field(form, 'displayName'), email: field(form, 'email'), phone: field(form, 'phone') || undefined };
    await run(() => selectedStaff ? updateBranchStaff(selectedStaff.id, common) : createBranchStaff({ ...common, password: field(form, 'password') }), selectedStaff ? 'Staff member updated.' : 'Staff member created.');
  }

  async function saveShopUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (!selectedShop) return;
    await run(() => createShopUser(selectedShop.id, { displayName: field(form, 'displayName'), email: field(form, 'email'), password: field(form, 'password'), phone: field(form, 'phone') || undefined }), 'Shop login created.');
  }

  async function saveRider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const common = { displayName: field(form, 'displayName'), email: field(form, 'email'), phone: field(form, 'phone') || undefined, employeeCode: field(form, 'employeeCode'), vehicleNumber: field(form, 'vehicleNumber') || undefined, serviceAreas: field(form, 'serviceAreas').split(',').map((area) => area.trim()).filter(Boolean), dailyCapacity: Number(field(form, 'dailyCapacity') || 10), deliveryFee: Number(field(form, 'deliveryFee') || 0), availability: field(form, 'availability') || 'AVAILABLE' };
    await run(() => selectedRider ? updateRider(selectedRider.id, common) : createRider({ ...common, password: field(form, 'password') }), selectedRider ? 'Rider updated.' : 'Rider created.');
  }

  function armOrDelete(id: string, action: () => Promise<unknown>, success: string) {
    if (deleteArmed !== id) { setDeleteArmed(id); setMessage('Press Confirm remove to continue.'); return; }
    void run(action, success);
  }

  const lists: Record<Resource, Array<{ id: string; title: string; meta: string }>> = {
    shops: shops.map((shop) => ({ id: shop.id, title: shop.name, meta: shop.addresses[0] ? `${shop.addresses[0].label || 'Pickup'} · ${shop.addresses[0].addressLine}` : 'Pickup address missing' })),
    staff: staff.map((person) => ({ id: person.id, title: person.displayName, meta: person.email })),
    riders: riders.map((rider) => ({ id: rider.id, title: rider.user.displayName, meta: `${rider.employeeCode} · ${rider.user.phone || rider.user.email}` })),
    shipments: shipments.map((shipment) => ({ id: shipment.id, title: shipment.cnNumber, meta: `${shipment.status.replaceAll('_', ' ')} · ${shipment.parties.find((party) => party.kind === 'RECEIVER')?.name || 'Receiver'}` })),
  };
  const visibleItems = lists[active].filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.trim().toLowerCase()));
  const focused = Boolean(selectedId) || !viewOnly;
  function backToDirectory() { setSelectedId(''); setViewOnly(true); setShopSection('profile'); setDeleteArmed(''); setMessage(''); }

  return <div className="page-content management-page">
    <div className="page-header"><div><span className="eyebrow">ADMIN / MANAGEMENT</span><h2>Management</h2><p>Choose one area, then create or select a record to update it.</p></div></div>
    {!focused && <nav className="management-selector" aria-label="Management areas">{resources.map((resource, index) => <button className={active === resource.id ? 'active' : ''} key={resource.id} onClick={() => setActive(resource.id)} style={{ '--card-index': index } as React.CSSProperties} type="button"><Icon name={resource.icon} /><span><strong>{resource.title}</strong><small>{resource.note}</small></span><b>{lists[resource.id].length}</b></button>)}</nav>}
    {message && <div className="management-message">{message}</div>}
    <div className={`management-workspace ${focused ? 'focused' : ''}`}>
      {!focused && <aside className="management-list"><label className="directory-search"><Icon name="search" /><input aria-label={`Search ${active}`} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${active}`} type="search" value={search} /></label>{active !== 'shipments' && <button className="new-record" onClick={() => { setSelectedId(''); setViewOnly(false); }} type="button"><Icon name="add" /><span><strong>Create new</strong><small>Add a {active.slice(0, -1)}</small></span></button>}{visibleItems.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setViewOnly(true); setShopSection('profile'); setDeleteArmed(''); }} type="button"><span><strong>{item.title}</strong><small>{item.meta}</small></span><Icon name="chevron_right" /></button>)}{!visibleItems.length && search && <small className="directory-no-results">No matching records</small>}</aside>}
      <section className="management-editor">
        {focused && <div className="management-page-nav"><button className="button subtle" onClick={backToDirectory} type="button"><Icon name="arrow_back" /> Back to {active}</button><span>{selectedId ? 'Record workspace' : `Create ${active.slice(0, -1)}`}</span></div>}
        {active === 'shops' && selectedShop && viewOnly && <nav className="record-section-nav" aria-label="Shop sections"><button className={shopSection === 'profile' ? 'active' : ''} onClick={() => setShopSection('profile')} type="button"><Icon name="storefront" /><span><strong>Profile</strong><small>Shop and pickup details</small></span></button><button className={shopSection === 'access' ? 'active' : ''} onClick={() => setShopSection('access')} type="button"><Icon name="manage_accounts" /><span><strong>Access</strong><small>Shop logins</small></span></button><button className={shopSection === 'financials' ? 'active' : ''} onClick={() => setShopSection('financials')} type="button"><Icon name="account_balance_wallet" /><span><strong>Financials</strong><small>Pricing and account</small></span></button></nav>}
        {active === 'shops' && selectedShop && viewOnly && shopSection === 'profile' && <DirectoryOverview icon="storefront" title={selectedShop.name} subtitle="Shop profile" rows={[['Pickup label', selectedShop.addresses[0]?.label || 'Not provided'], ['Pickup address', selectedShop.addresses[0]?.addressLine || 'Not provided'], ['City', selectedShop.addresses[0]?.city || 'Not provided'], ['Shop logins', String(shopUsers.length)]]} onEdit={() => setViewOnly(false)} />}
        {active === 'shops' && selectedShop && viewOnly && shopSection === 'access' && <div className="shop-access-page"><form className="shop-login-form" onSubmit={saveShopUser}><EditorHeader title="Create shop login" subtitle="Can create and view shipments for this shop only" /><div className="compact-form-grid"><Input name="displayName" label="Name" /><Input name="email" label="Email" type="email" /><Input name="phone" label="Phone" required={false} /><Input name="password" label="Temporary password" type="password" minLength={12} hint="Minimum 12 characters" /></div><EditorActions busy={busy} canDelete={false} armed={false} saveLabel="Create login" onDelete={() => undefined} /></form><div className="shop-user-list"><span className="eyebrow">ACTIVE SHOP LOGINS</span>{shopUsers.length ? shopUsers.map((user) => <div key={user.id}><strong>{user.displayName}</strong><small>{user.email}</small></div>) : <p>No shop logins created.</p>}</div></div>}
        {active === 'shops' && selectedShop && viewOnly && shopSection === 'financials' && <ShopFinancialPanel shopId={selectedShop.id} />}
        {active === 'shops' && (!selectedShop || !viewOnly) && <form key={`${selectedShop?.id || 'new-shop'}-${shopPricing?.id || 'none'}`} onSubmit={saveShop}><EditorHeader title={selectedShop ? 'Edit shop' : 'New shop'} /><div className="compact-form-grid"><Input name="name" label="Shop name" value={selectedShop?.name} /><Input name="branchLabel" label="Pickup label" value={selectedShop?.addresses[0]?.label || 'Main pickup'} /><Input name="addressLine" label="Pickup address" value={selectedShop?.addresses[0]?.addressLine} wide /><Input name="city" label="City" value={selectedShop?.addresses[0]?.city} /><Input name="deliveryFee" label="Delivery fee (PKR)" type="number" value={shopPricing?.shipmentCharge ?? '0'} hint="Used as the default for new shipments" /></div><EditorActions busy={busy} canDelete={Boolean(selectedShop)} armed={deleteArmed === selectedShop?.id} onDelete={() => selectedShop && armOrDelete(selectedShop.id, () => deleteCustomer(selectedShop.id), 'Shop removed.')} /></form>}
        {active === 'staff' && selectedStaff && viewOnly && <DirectoryOverview icon="badge" title={selectedStaff.displayName} subtitle="Staff profile" rows={[["Email", selectedStaff.email], ['Phone', selectedStaff.phone || 'Not provided'], ['Rider access', selectedStaff.riderEnabled ? 'Enabled' : 'Not enabled'], ['Permissions', String(selectedStaff.permissions?.length ?? 0)]]} onEdit={() => setViewOnly(false)} />}
        {active === 'staff' && (!selectedStaff || !viewOnly) && <form key={selectedStaff?.id || 'new-staff'} onSubmit={saveStaff}><EditorHeader title={selectedStaff ? 'Edit staff member' : 'New staff member'} /><div className="compact-form-grid"><Input name="displayName" label="Name" value={selectedStaff?.displayName} /><Input name="email" label="Email" type="email" value={selectedStaff?.email} /><Input name="phone" label="Phone" required={false} value={selectedStaff?.phone} />{!selectedStaff && <Input name="password" label="Temporary password" type="password" minLength={12} hint="Minimum 12 characters" />}</div><EditorActions busy={busy} canDelete={Boolean(selectedStaff)} armed={deleteArmed === selectedStaff?.id} onDelete={() => selectedStaff && armOrDelete(selectedStaff.id, () => deleteBranchStaff(selectedStaff.id), 'Staff access removed.')} /></form>}
        {active === 'riders' && selectedRider && viewOnly && <DirectoryOverview icon="two_wheeler" title={selectedRider.user.displayName} subtitle="Rider profile" rows={[['Employee code', selectedRider.employeeCode], ['Phone', selectedRider.user.phone || 'Not provided'], ['Email', selectedRider.user.email], ['Vehicle', selectedRider.vehicleDetails?.vehicleNumber || 'Not provided'], ['Service areas', selectedRider.serviceAreas.join(', ') || 'All Lahore'], ['Active parcels', String(selectedRider.assignments.length)], ['Daily capacity', String(selectedRider.dailyCapacity)], ['Pay per delivery', `PKR ${Number(selectedRider.deliveryFee || 0).toFixed(2)}`], ['Completed rides', String(selectedRider.earnings?.length ?? 0)], ['Pending rider pay', `PKR ${(selectedRider.earnings ?? []).filter((earning) => earning.status === 'PENDING').reduce((total, earning) => total + Number(earning.amount), 0).toFixed(2)}`], ['Availability', selectedRider.availability.replaceAll('_', ' ')]]} onEdit={() => setViewOnly(false)} />}
        {active === 'riders' && (!selectedRider || !viewOnly) && <form key={selectedRider?.id || 'new-rider'} onSubmit={saveRider}><EditorHeader title={selectedRider ? 'Edit rider' : 'New rider'} /><div className="compact-form-grid"><Input name="displayName" label="Name" value={selectedRider?.user.displayName} /><Input name="employeeCode" label="Employee code" value={selectedRider?.employeeCode} /><Input name="email" label="Email" type="email" value={selectedRider?.user.email} /><Input name="phone" label="Phone" required={false} value={selectedRider?.user.phone} /><Input name="vehicleNumber" label="Vehicle number" required={false} value={selectedRider?.vehicleDetails?.vehicleNumber} /><Input name="serviceAreas" label="Lahore service areas (comma separated)" required={false} value={selectedRider?.serviceAreas.join(', ')} wide /><Input name="dailyCapacity" label="Daily parcel capacity" type="number" value={String(selectedRider?.dailyCapacity ?? 10)} /><Input name="deliveryFee" label="Pay per completed delivery (PKR)" type="number" value={String(selectedRider?.deliveryFee ?? 0)} /><label className="field"><span>Availability</span><select defaultValue={selectedRider?.availability ?? 'AVAILABLE'} name="availability"><option value="AVAILABLE">Available</option><option value="BUSY">Busy</option><option value="OFF_DUTY">Off duty</option></select></label>{!selectedRider && <Input name="password" label="Temporary password" type="password" minLength={8} hint="Minimum 8 characters" />}</div><EditorActions busy={busy} canDelete={Boolean(selectedRider)} armed={deleteArmed === selectedRider?.id} onDelete={() => selectedRider && armOrDelete(selectedRider.id, () => deleteRider(selectedRider.id), 'Rider access removed.')} /></form>}
        {active === 'shipments' && selectedShipment && viewOnly && <DirectoryOverview icon="package_2" title={selectedShipment.cnNumber} subtitle="Shipment record" rows={[["Status", selectedShipment.status.replaceAll('_', ' ')], ['Sender', selectedShipment.parties.find((party) => party.kind === 'SENDER')?.name || 'Not provided'], ['Receiver', selectedShipment.parties.find((party) => party.kind === 'RECEIVER')?.name || 'Not provided'], ['Service', selectedShipment.serviceType.replaceAll('_', ' ')]]} onEdit={() => setViewOnly(false)} />}
        {active === 'shipments' && selectedShipment && !viewOnly && <form key={selectedShipment.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => correctDispatchStatus(selectedShipment.id, field(form, 'status'), field(form, 'reason')), 'Shipment status corrected.'); }}><EditorHeader title="Correct shipment" subtitle={selectedShipment.cnNumber} /><div className="compact-form-grid"><label className="field"><span>Correct status</span><select name="status" defaultValue={selectedShipment.status}>{shipmentStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><Input name="reason" label="Reason for correction" minLength={10} hint="Explain why this administrative correction is necessary" wide /></div><EditorActions busy={busy} canDelete armed={deleteArmed === selectedShipment.id} saveLabel="Save correction" onDelete={() => armOrDelete(selectedShipment.id, () => deleteDispatch(selectedShipment.id), 'Shipment removed from active records.')} /></form>}
      </section>
    </div>
  </div>;
}

function ShopFinancialPanel({ shopId }: { shopId: string }) {
  const [summary, setSummary] = useState<ShopFinancialSummary | null>(null); const [pricing, setPricing] = useState<ShopPricingAgreement | null>(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [period, setPeriod] = useState('month');
  async function load() { setBusy(true); setMessage(''); try { const now = new Date(); const from = period === 'today' ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : period === 'week' ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)) : period === 'previous' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1); const to = period === 'previous' ? new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) : now; const [report, agreements] = await Promise.all([getShopFinancialSummary(shopId, from.toISOString(), to.toISOString()), getShopPricing(shopId)]); setSummary(report); setPricing(agreements.find((item) => !item.effectiveTo) ?? agreements[0] ?? null); } catch (error) { setMessage((error as ApiError).message); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, [shopId, period]);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage(''); try { await saveShopPricing(shopId, { currencyCode: field(form, 'currencyCode'), shipmentCharge: Number(field(form, 'shipmentCharge')), codFeeFixed: Number(field(form, 'codFeeFixed')), codFeePercent: Number(field(form, 'codFeePercent')), returnCharge: Number(field(form, 'returnCharge')), deductChargesFromCod: form.get('deductChargesFromCod') === 'on' }); setMessage('New pricing version saved. Existing shipment figures were not changed.'); await load(); } catch (error) { setMessage((error as ApiError).message); } finally { setBusy(false); } }
  const money = (value: string) => `${pricing?.currencyCode ?? 'PKR'} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <section className="shop-financial-panel"><header><div><span className="eyebrow">FINANCIALS</span><h3>Calculated shop account</h3><p>Derived from shipment ledger entries, verified COD collections, and allocated settlements.</p></div><select aria-label="Financial period" onChange={(event) => setPeriod(event.target.value)} value={period}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="previous">Previous month</option></select></header>{message && <div className="management-message">{message}</div>}{busy && !summary ? <div className="state-panel"><p>Loading financial records…</p></div> : summary && <><div className="financial-metrics"><MetricValue label="Shipments" value={String(summary.counts.total)} /><MetricValue label="Delivered" value={String(summary.counts.delivered)} /><MetricValue label="Courier revenue" value={money(summary.totals.revenue)} /><MetricValue label="Courier cost" value={money(summary.totals.cost)} /><MetricValue label="Net profit" value={money(summary.totals.profit)} /><MetricValue label="COD collected" value={money(summary.totals.codCollected)} /><MetricValue label="Paid to shop" value={money(summary.totals.paidToShop)} /><MetricValue label="Outstanding" value={money(summary.totals.outstanding)} /></div><div className="financial-drilldown"><h4>Shipment drill-down</h4>{summary.shipments.length ? summary.shipments.map((shipment) => <details key={shipment.id}><summary><span><strong>{shipment.cnNumber}</strong><small>{shipment.status.replaceAll('_', ' ')}</small></span><span><b>{money(shipment.profit)} profit</b><small>{money(shipment.outstanding)} outstanding</small></span></summary><div><span>Revenue <b>{money(shipment.revenue)}</b></span><span>Cost <b>{money(shipment.cost)}</b></span><span>COD collected <b>{money(shipment.codCollected)}</b></span><span>Shop payable <b>{money(shipment.shopPayable)}</b></span>{shipment.entries.map((entry) => <p key={entry.id}>{entry.type.replaceAll('_', ' ')} · {money(entry.amount)} · {entry.reason}</p>)}</div></details>) : <p>No shipments in this period.</p>}</div></>}
  <form className="shop-pricing-form" onSubmit={save}><h4>Shop pricing</h4><p>Saving creates a new effective version and never rewrites old shipment charges.</p><div className="compact-form-grid"><Input name="currencyCode" label="Currency" value={pricing?.currencyCode ?? 'PKR'} /><Input name="shipmentCharge" label="Shipment charge" type="number" value={pricing?.shipmentCharge ?? '0'} /><Input name="codFeeFixed" label="Fixed COD fee" type="number" value={pricing?.codFeeFixed ?? '0'} /><Input name="codFeePercent" label="COD fee percent" type="number" value={pricing?.codFeePercent ?? '0'} /><Input name="returnCharge" label="Return charge" type="number" value={pricing?.returnCharge ?? '0'} /><label className="field financial-checkbox"><span>COD deductions</span><input defaultChecked={pricing?.deductChargesFromCod ?? true} name="deductChargesFromCod" type="checkbox" /> Deduct courier charges from shop COD</label></div><button className="button primary" disabled={busy} type="submit">Save new pricing version</button></form></section>;
}
function MetricValue({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }

function EditorHeader({ title, subtitle }: { title: string; subtitle?: string }) { return <header className="editor-header"><div><span>ACTIVE WORKSPACE</span><h3>{title}</h3>{subtitle && <small>{subtitle}</small>}</div></header>; }
function DirectoryOverview({ icon, title, subtitle, rows, onEdit }: { icon: string; title: string; subtitle: string; rows: Array<[string, string]>; onEdit: () => void }) { return <div className="directory-overview"><header><div className="directory-avatar"><Icon name={icon} /></div><div><span>{subtitle}</span><h3>{title}</h3></div><button className="button subtle" onClick={onEdit} type="button"><Icon name="edit" /> Edit</button></header><dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl></div>; }
function Input({ name, label, value, type = 'text', wide = false, required = true, minLength, hint }: { name: string; label: string; value?: string | null; type?: string; wide?: boolean; required?: boolean; minLength?: number; hint?: string }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span><input defaultValue={value ?? ''} minLength={minLength} name={name} type={type} required={required} />{hint && <small>{hint}</small>}</label>; }
function EditorActions({ busy, canDelete, armed, onDelete, saveLabel = 'Save' }: { busy: boolean; canDelete: boolean; armed: boolean; onDelete: () => void; saveLabel?: string }) { return <div className="editor-actions"><button className="button primary" disabled={busy} type="submit">{busy ? 'Saving…' : saveLabel}</button>{canDelete && <button className={`button ${armed ? 'danger' : 'subtle'}`} disabled={busy} onClick={onDelete} type="button">{armed ? 'Confirm remove' : 'Remove'}</button>}</div>; }
