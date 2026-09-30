'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { assignDispatchRider, correctDispatchStatus, enableMyRiderAccess, getConsignments, getRiderRecommendations, getSession, openDispatchDocument, trackDispatch, type ApiError, type DispatchSummary, type RiderRecommendation, type TrackingResult } from '../lib/api';
import { SpotlightCard } from './animated-ui';

const label = (value: string) => value.replaceAll('_', ' ');
const statusClass = (status: string) => status === 'DELIVERED' ? 'status-delivered' : status.includes('FAILED') ? 'status-failed' : status === 'OUT_FOR_DELIVERY' ? 'status-ofd' : status === 'DISPATCHED' ? 'status-transit' : 'status-booked';
const adminStatuses = ['DRAFT', 'CONFIRMED', 'ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED'];
const riderAssignableStatuses = ['CONFIRMED', 'ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERY_ATTEMPT_FAILED'];

function Metric({ title, value }: { title: string; value: number }) { return <SpotlightCard className="metric-card"><div className="metric-top"><span>{title}</span><span className="metric-pulse" /></div><strong>{value}</strong><small><i /> Live API data</small></SpotlightCard>; }
function Icon({ name }: { name: string }) { return <span aria-hidden="true" className="material-symbols-outlined icon">{name}</span>; }
function BikeLoader({ label = 'Loading data' }: { label?: string }) { return <div className="data-bike-loader" aria-label={label} aria-live="polite"><div className="data-loader-inner"><img className="rider-bike-image" src="/assets/logo.jpg" alt="Delivery rider" /><div className="skeleton-stack" aria-hidden="true"><i /><i /><i /></div></div></div>; }

export function DispatchDashboard({ onCreate, onViewAll }: { onCreate: () => void; onViewAll: () => void }) {
  const [rows, setRows] = useState<DispatchSummary[]>([]); const [error, setError] = useState('');
  useEffect(() => { getConsignments().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  const counts = useMemo(() => ({ today: rows.filter((r) => new Date(r.createdAt).toDateString() === new Date().toDateString()).length, pending: rows.filter((r) => ['DRAFT', 'CONFIRMED'].includes(r.status)).length, active: rows.filter((r) => ['DISPATCHED', 'OUT_FOR_DELIVERY'].includes(r.status)).length, delivered: rows.filter((r) => r.status === 'DELIVERED').length }), [rows]);
  return <div className="page-content"><div className="page-header"><div><span className="eyebrow">SWIFTLOG / TODAY</span><h2>Courier operations</h2><p>Current city-level shipment, pickup, and delivery activity.</p></div><button className="button primary" onClick={onCreate}>+ Create shipment</button></div>{error && <div className="error-callout">{error}</div>}<section className="metric-grid"><Metric title="Shipments today" value={counts.today} /><Metric title="Draft / confirmed" value={counts.pending} /><Metric title="On delivery" value={counts.active} /><Metric title="Delivered" value={counts.delivered} /></section><section className="surface-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Recent shipments</h3></div><button className="text-button" onClick={onViewAll}>View all →</button></div><DispatchTable rows={rows.slice(0, 8)} /></section></div>;
}

export function DispatchList({ onCreate }: { onCreate: () => void }) {
  const [rows, setRows] = useState<DispatchSummary[]>([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState('ALL'); const [loading, setLoading] = useState(true); const [message, setMessage] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => { setLoading(true); getConsignments(search ? `?search=${encodeURIComponent(search)}` : '').then((data) => { setRows(data); setLoading(false); }).catch((e: ApiError) => { setMessage(e.message); setLoading(false); }); }, 250); return () => clearTimeout(timer); }, [search]);
  const visible = status === 'ALL' ? rows : rows.filter((row) => row.status === status);
  return <div className="page-content"><div className="page-header"><div><span className="eyebrow">DISPATCHES</span><h2>All dispatches</h2><p>Search permanent CN records and monitor delivery state.</p></div><button className="button primary" onClick={onCreate}>+ Create dispatch</button></div><div className="filter-bar"><label className="filter-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search CN, customer, receiver…" /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="CONFIRMED">Confirmed</option><option value="DISPATCHED">Dispatched</option><option value="OUT_FOR_DELIVERY">Out for delivery</option><option value="DELIVERED">Delivered</option><option value="DELIVERY_FAILED">Failed</option><option value="RETURNED">Returned</option></select></div>{message && <div className="error-callout">{message}</div>}<div className="surface-panel table-panel">{loading ? <BikeLoader label="Loading dispatches" /> : <DispatchTable rows={visible} />}</div></div>;
}

function DispatchTable({ rows }: { rows: DispatchSummary[] }) {
  const [displayRows, setDisplayRows] = useState(rows);
  const [recommendations, setRecommendations] = useState<RiderRecommendation[]>([]);
  const [assigningRow, setAssigningRow] = useState<DispatchSummary | null>(null);
  const [correctingRow, setCorrectingRow] = useState<DispatchSummary | null>(null);
  const [correctionStatus, setCorrectionStatus] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [loadingRiders, setLoadingRiders] = useState(false);
  const [message, setMessage] = useState('');
  const isAdmin = getSession()?.user.roles.includes('ADMIN') ?? false;

  useEffect(() => setDisplayRows(rows), [rows]);
  useEffect(() => {
    if (!assigningRow && !correctingRow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [assigningRow, correctingRow]);
  async function assign(row: DispatchSummary, riderId: string) {
    if (!riderId) return;
    setMessage('');
    try {
      await assignDispatchRider(row.id, riderId);
      const rider = recommendations.find((item) => item.id === riderId);
      if (rider) setDisplayRows((current) => current.map((item) => item.id === row.id ? { ...item, status: item.status === 'CONFIRMED' ? 'ASSIGNED_TO_RIDER' : item.status, assignments: [{ riderId, rider: { employeeCode: rider.employeeCode, user: { displayName: rider.user.displayName } } }] } : item));
      setAssigningRow(null);
    } catch (error) { setMessage((error as ApiError).message); }
  }

  async function openAssignment(row: DispatchSummary) {
    setAssigningRow(row); setLoadingRiders(true); setMessage('');
    try {
      let available = await getRiderRecommendations(row.id);
      const session = getSession();
      if (session?.user.roles.includes('ADMIN') && !available.some((rider) => rider.user.id === session.user.id)) {
        await enableMyRiderAccess(`ADM-${session.user.id.slice(0, 8)}`);
        available = await getRiderRecommendations(row.id);
      }
      setRecommendations(available);
    }
    catch (error) { setMessage((error as ApiError).message); setAssigningRow(null); }
    finally { setLoadingRiders(false); }
  }

  async function updateStatus(event: React.FormEvent) {
    event.preventDefault();
    if (!correctingRow || !correctionStatus || correctionReason.trim().length < 10) return;
    setMessage(''); setCorrectionError(''); setCorrectionBusy(true);
    try {
      const updated = await correctDispatchStatus(correctingRow.id, correctionStatus, correctionReason.trim());
      setDisplayRows((current) => current.map((item) => item.id === correctingRow.id ? { ...item, status: updated.status, currentStatusAt: updated.currentStatusAt } : item));
      setCorrectingRow(null); setCorrectionStatus(''); setCorrectionReason('');
    } catch (error) { setCorrectionError((error as ApiError).message); }
    finally { setCorrectionBusy(false); }
  }

  async function documentAction(row: DispatchSummary, kind: 'dispatch' | 'label', mode: 'view' | 'download') {
    setMessage('');
    try { await openDispatchDocument(row.id, kind, mode); }
    catch (error) { setMessage((error as ApiError).message); }
  }

  if (!displayRows.length) return <div className="state-panel"><h3>No dispatches found</h3><p>Create a dispatch or change the filters.</p></div>;
  return <>{message && <div className="error-callout">{message}</div>}<div className="table-wrap"><table><thead><tr><th>CN</th><th>SENDER</th><th>RECEIVER</th><th>PARCEL</th><th>RIDER</th><th>STATUS / NEXT STEP</th><th>ACTIONS</th></tr></thead><tbody>{displayRows.map((row) => {
    const sender = row.parties.find((party) => party.kind === 'SENDER');
    const receiver = row.parties.find((party) => party.kind === 'RECEIVER');
    const assignment = row.assignments[0];
    return <tr key={row.id}>
      <td className="table-cell mono" data-label="CN">{row.cnNumber}</td>
      <td className="table-cell" data-label="Sender"><span><strong>{sender?.name ?? row.customer?.name ?? 'Not provided'}</strong><small>{sender?.phone ?? ''}</small></span></td>
      <td className="table-cell" data-label="Receiver"><span><strong>{receiver?.name ?? 'Not provided'}</strong><small>{receiver?.phone ?? ''}</small></span></td>
      <td className="table-cell" data-label="Parcel">{row.items.reduce((sum, item) => sum + item.quantity, 0)} parcel item(s)</td>
      <td className="table-cell" data-label="Rider"><span><strong>{assignment?.rider.user.displayName ?? 'Not assigned'}</strong>{isAdmin && riderAssignableStatuses.includes(row.status) && <button className="assign-rider-button" onClick={() => void openAssignment(row)} type="button"><Icon name={assignment ? 'swap_horiz' : 'person_add'} /> {assignment ? 'Change rider' : 'Choose rider'}</button>}</span></td>
      <td className="table-cell" data-label="Status"><span><span className={`status-badge ${statusClass(row.status)}`}>{label(row.status)}</span>{isAdmin && <button className="assign-rider-button" onClick={() => { setCorrectingRow(row); setCorrectionStatus(''); setCorrectionReason(''); }} type="button"><Icon name="edit" /> Correct status</button>}</span></td>
      <td className="table-cell document-actions" data-label="Actions"><details className="shipment-action-menu"><summary><Icon name="folder_open" /><span>Documents</span><Icon name="expand_more" /></summary><div className="shipment-action-popover"><header><span><strong>{row.cnNumber}</strong><small>Documents and customer link</small></span></header><section><div className="document-kind"><Icon name="description" /><span><strong>Dispatch sheet</strong><small>Complete shipment record</small></span></div><div className="document-buttons"><button onClick={() => void documentAction(row, 'dispatch', 'view')} type="button"><Icon name="visibility" /> Preview</button><button onClick={() => void documentAction(row, 'dispatch', 'download')} type="button"><Icon name="download" /> Download</button></div></section><section><div className="document-kind"><Icon name="label" /><span><strong>Parcel label</strong><small>Print and attach to parcel</small></span></div><div className="document-buttons"><button onClick={() => void documentAction(row, 'label', 'view')} type="button"><Icon name="visibility" /> Preview</button><button onClick={() => void documentAction(row, 'label', 'download')} type="button"><Icon name="download" /> Download</button></div></section><a className="customer-track-action" href={`/track/${encodeURIComponent(row.cnNumber)}${row.publicTrackingKey ? `?key=${encodeURIComponent(row.publicTrackingKey)}` : ''}`} target="_blank" rel="noreferrer"><Icon name="share_location" /><span><strong>Customer tracking page</strong><small>Open the link to copy or share it</small></span><Icon name="open_in_new" /></a></div></details></td>
    </tr>;
  })}</tbody></table></div>{assigningRow && typeof document !== 'undefined' && createPortal(<div className="assignment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssigningRow(null); }} role="presentation"><section aria-labelledby="assign-rider-title" aria-modal="true" className="assignment-panel" role="dialog"><header><div><span className="eyebrow">RIDER WORKLOAD</span><h3 id="assign-rider-title">Assign {assigningRow.cnNumber}</h3><p>Recommended by Lahore delivery area, availability, and current parcel load.</p></div><button aria-label="Close rider assignment" className="icon-button" onClick={() => setAssigningRow(null)} type="button"><Icon name="close" /></button></header>{loadingRiders ? <BikeLoader label="Checking rider workload" /> : <div className="rider-recommendations">{recommendations.map((rider, index) => { const isMe = rider.user.id === getSession()?.user.id; return <article className={rider.areaMatched && !rider.atCapacity && rider.availability === 'AVAILABLE' ? 'recommended' : ''} key={rider.id}><div className="recommendation-rank">{index + 1}</div><div className="rider-choice-main"><strong>{rider.user.displayName}{isMe ? ' (You)' : ''}</strong><small>{rider.employeeCode}{rider.serviceAreas.length ? ` | ${rider.serviceAreas.join(', ')}` : ' | All Lahore'}</small><div><span>{rider.activeParcels} active</span><span>{rider.remainingCapacity} spaces left</span>{rider.areaMatched && <b><Icon name="location_on" /> {rider.matchedArea} match</b>}</div></div><span className={`availability ${rider.availability.toLowerCase()}`}>{rider.availability.replaceAll('_', ' ')}</span><button className="button primary" disabled={rider.atCapacity || rider.availability === 'OFF_DUTY'} onClick={() => void assign(assigningRow, rider.id)} type="button">Assign</button></article>; })}{!recommendations.length && <div className="state-panel"><h3>No active riders</h3><p>Create or activate a rider before assigning this shipment.</p></div>}</div>}</section></div>, document.body)}{correctingRow && typeof document !== 'undefined' && createPortal(<div className="assignment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCorrectingRow(null); }} role="presentation"><form aria-labelledby="correct-status-title" aria-modal="true" className="assignment-panel correction-panel" onSubmit={updateStatus} role="dialog"><header><div><span className="eyebrow">ADMINISTRATIVE CORRECTION</span><h3 id="correct-status-title">Correct {correctingRow.cnNumber}</h3><p>This writes a permanent tracking and audit record.</p></div><button aria-label="Close status correction" className="icon-button" onClick={() => setCorrectingRow(null)} type="button"><Icon name="close" /></button></header><div className="correction-fields"><label className="field"><span>Current status</span><input disabled value={label(correctingRow.status)} /></label><label className="field"><span>Correct status</span><select onChange={(event) => setCorrectionStatus(event.target.value)} required value={correctionStatus}><option value="">Select corrected status</option>{adminStatuses.filter((status) => status !== correctingRow.status).map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label className="field"><span>Reason for correction</span><textarea autoFocus minLength={4} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain what was entered incorrectly" required value={correctionReason} /></label><div className="correction-actions"><button className="button secondary" onClick={() => setCorrectingRow(null)} type="button">Cancel</button><button className="button primary" disabled={!correctionStatus || correctionReason.trim().length < 4} type="submit">Save correction</button></div></div></form></div>, document.body)}</>;
}

export function TrackingView() {
  const [cn, setCn] = useState(''); const [result, setResult] = useState<TrackingResult | null>(null); const [message, setMessage] = useState('');
  useEffect(() => { const queued = sessionStorage.getItem('swiftlog.tracking-query'); if (queued) { setCn(queued); sessionStorage.removeItem('swiftlog.tracking-query'); } }, []);
  async function submit(e: React.FormEvent) { e.preventDefault(); setMessage(''); try { setResult(await trackDispatch(cn)); } catch (error) { setMessage((error as ApiError).message); } }
  return <div className="page-content"><div className="page-header"><div><span className="eyebrow">TRACKING</span><h2>Track a dispatch</h2><p>Search by permanent CN to see its state and complete history.</p></div></div><form className="surface-panel tracking-search" onSubmit={submit}><input value={cn} onChange={(e) => setCn(e.target.value.toUpperCase())} placeholder="CN-TEZGAM-2026-000002" required /><button className="button primary">Track dispatch</button></form>{message && <div className="error-callout">{message}</div>}{result && !result.found && <div className="surface-panel state-panel"><h3>CN not found</h3><p>Check the number and try again.</p></div>}{result?.found && <section className="surface-panel tracking-result"><div className="panel-heading"><div><span className="eyebrow">{result.shipment.cnNumber}</span><h3>{label(result.shipment.status)}</h3></div><span className={`status-badge ${statusClass(result.shipment.status)}`}>{label(result.shipment.status)}</span></div><div className="journey">{result.shipment.events.map((event, index) => <div className="journey-step" key={`${event.eventTime}-${index}`}><i /><div><strong>{label(event.eventType)}</strong><p>{event.remarks || 'Status recorded'}</p><small>{new Date(event.eventTime).toLocaleString()}</small></div></div>)}</div></section>}</div>;
}
