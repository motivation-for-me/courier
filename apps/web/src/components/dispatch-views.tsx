'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { assignDispatchRider, correctDispatchStatus, enableMyRiderAccess, getConsignmentPage, getDispatchDashboardSummary, getRiderRecommendations, getSession, openDispatchDocument, trackDispatch, type ApiError, type DispatchSummary, type RiderRecommendation, type TrackingResult } from '../lib/api';
import { SpotlightCard } from './animated-ui';

const label = (value: string) => value.replaceAll('_', ' ');
const statusClass = (status: string) => status === 'DELIVERED' ? 'status-delivered' : status.includes('FAILED') ? 'status-failed' : status === 'OUT_FOR_DELIVERY' ? 'status-ofd' : status === 'DISPATCHED' ? 'status-transit' : 'status-booked';
const adminStatuses = ['DRAFT', 'CONFIRMED', 'ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED'];
const riderAssignableStatuses = ['CONFIRMED', 'ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERY_ATTEMPT_FAILED'];

function Metric({ title, value }: { title: string; value: number }) { return <SpotlightCard className="metric-card"><div className="metric-top"><span>{title}</span><span className="metric-pulse" /></div><strong>{value}</strong><small><i /> Live API data</small></SpotlightCard>; }
function Icon({ name }: { name: string }) { return <span aria-hidden="true" className="material-symbols-outlined icon">{name}</span>; }
function DataSkeleton({ label = 'Loading data', rows = 5 }: { label?: string; rows?: number }) { return <div className="data-skeleton-loader" aria-label={label} aria-live="polite"><div className="table-skeleton" aria-hidden="true">{Array.from({ length: rows }, (_, index) => <div key={index}><i /><i /><i /><i /></div>)}</div></div>; }
function BikeLoader({ label }: { label?: string }) { return <DataSkeleton label={label} rows={3} />; }

export function DispatchDashboard({ onCreate, onViewAll }: { onCreate: () => void; onViewAll: () => void }) {
  const [rows, setRows] = useState<DispatchSummary[]>([]); const [counts, setCounts] = useState({ today: 0, pending: 0, active: 0, delivered: 0, total: 0 }); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    const delay = window.setTimeout(() => setShowSkeleton(true), 180);
    const loadDashboard = async () => {
      try {
        const summary = await getDispatchDashboardSummary();
        setRows(summary.recent);
        setCounts(summary.counts);
      } catch (summaryError) {
        try {
          const [fallback, history] = await Promise.all([
            getConsignmentPage('?page=1&limit=100&scope=active'),
            getConsignmentPage('?page=1&limit=1&scope=history'),
          ]);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const count = (statuses: string[]) => fallback.items.filter((item) => statuses.includes(item.status)).length;
          setRows(fallback.items.slice(0, 8));
          setCounts({
            today: fallback.items.filter((item) => new Date(item.createdAt) >= today).length,
            pending: count(['DRAFT', 'CONFIRMED']),
            active: count(['ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY']),
            delivered: history.total,
            total: fallback.total + history.total,
          });
          setError('Live summary is unavailable; showing shipment records.');
        } catch (fallbackError) {
          const message = fallbackError instanceof Error && fallbackError.message ? fallbackError.message : summaryError instanceof Error ? summaryError.message : 'Shipment data could not be loaded.';
          setError(message);
        }
      } finally {
        window.clearTimeout(delay);
        setLoading(false);
        setShowSkeleton(false);
      }
    };
    void loadDashboard();
    return () => window.clearTimeout(delay);
  }, []);
  return <div className="page-content"><div className="page-header"><div><span className="eyebrow">SWIFTLOG / TODAY</span><h2>Courier operations</h2><p>Current city-level shipment, pickup, and delivery activity.</p></div>{getSession()?.user.permissions.includes('shipment:create') && <button className="button primary" onClick={onCreate}>+ Create shipment</button>}</div>{error && <div className="error-callout">{error}</div>}{loading && showSkeleton ? <><section className="metric-grid metric-skeleton" aria-label="Loading overview"><i /><i /><i /><i /></section><section className="surface-panel"><DataSkeleton label="Loading recent shipments" rows={4} /></section></> : !loading && <><section className="metric-grid"><Metric title="Shipments today" value={counts.today} /><Metric title="Draft / confirmed" value={counts.pending} /><Metric title="On delivery" value={counts.active} /><Metric title="Delivered" value={counts.delivered} /></section><button className="history-entry" onClick={onViewAll} type="button"><span className="history-entry-icon"><Icon name="history" /></span><span><small>SHIPMENT HISTORY</small><strong>Previous shipments</strong><em>Search and filter completed deliveries</em></span><b>{counts.delivered}<Icon name="arrow_forward" /></b></button><section className="surface-panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h3>Active shipments</h3></div><button className="text-button" onClick={onViewAll}>View history <Icon name="arrow_forward" /></button></div><DispatchTable rows={rows} /></section></>}</div>;
}

export function DispatchList({ onCreate, history = false }: { onCreate: () => void; history?: boolean }) {
  const [rows, setRows] = useState<DispatchSummary[]>([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState('ALL'); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1); const [pages, setPages] = useState(1); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [showSkeleton, setShowSkeleton] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    const requestDelay = window.setTimeout(() => {
      const query = new URLSearchParams({ page: String(page), limit: '25', scope: history ? 'history' : 'active' });
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'ALL') query.set('status', status);
      if (from) query.set('from', `${from}T00:00:00.000`);
      if (to) query.set('to', `${to}T23:59:59.999`);
      setLoading(true); setMessage('');
      const skeletonDelay = window.setTimeout(() => setShowSkeleton(true), 180);
      getConsignmentPage(`?${query}`).then((result) => {
        if (!result || !Array.isArray(result.items) || typeof result.total !== 'number') throw new Error('The shipment response was incomplete.');
        setRows(result.items); setTotal(result.total); setPages(result.pages); if (page > result.pages) setPage(result.pages);
      }).catch((e: ApiError | Error) => setMessage(e instanceof TypeError ? 'Network error while loading shipment records. Check the API connection.' : e.message || 'Shipment data could not be loaded.')).finally(() => { window.clearTimeout(skeletonDelay); setLoading(false); setShowSkeleton(false); });
    }, search ? 300 : 0);
    return () => window.clearTimeout(requestDelay);
  }, [search, status, from, to, page, history]);
  const updateSearch = (value: string) => { setSearch(value); setPage(1); };
  const clearFilters = () => { setSearch(''); setStatus('ALL'); setFrom(''); setTo(''); setPage(1); };
  return <div className="page-content"><div className="page-header"><div><span className="eyebrow">{history ? 'SHIPMENT HISTORY' : 'ACTIVE SHIPMENTS'}</span><h2>{history ? 'Shipment history' : 'Shipments'}</h2><p>{history ? 'Delivered and completed shipment records.' : 'Manage shipments awaiting completion.'}</p></div>{getSession()?.user.permissions.includes('shipment:create') && <button className="button primary" onClick={onCreate}>+ Create dispatch</button>}</div><div className="history-filters"><label className="filter-search"><Icon name="search" /><input value={search} onChange={(e) => updateSearch(e.target.value)} placeholder="CN, shop, sender, receiver or phone" /></label><select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="ALL">All statuses</option>{!history && <option value="DRAFT">Draft</option>}{!history && <option value="CONFIRMED">Confirmed</option>}{!history && <option value="ASSIGNED_TO_RIDER">Rider assigned</option>}{!history && <option value="DISPATCHED">Dispatched</option>}{!history && <option value="OUT_FOR_DELIVERY">Out for delivery</option>}{history && <option value="DELIVERED">Delivered</option>}{!history && <option value="DELIVERY_ATTEMPT_FAILED">Delivery attempt failed</option>}{!history && <option value="DELIVERY_FAILED">Delivery failed</option>}{!history && <option value="RETURNED">Returned</option>}{!history && <option value="CANCELLED">Cancelled</option>}</select><label className="date-filter"><span>From</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label className="date-filter"><span>To</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label><button className="button subtle" onClick={clearFilters} type="button">Clear</button></div><div className="history-result-count"><span><strong>{rows.length}</strong> shown · {total} total</span>{pages > 1 && <nav aria-label="Shipment history pages"><button className="button subtle" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><span>Page {page} of {pages}</span><button className="button subtle" disabled={page === pages || loading} onClick={() => setPage((value) => value + 1)} type="button">Next</button></nav>}</div>{message && <div className="error-callout" role="alert">{message}</div>}<div className="surface-panel table-panel">{loading && showSkeleton ? <DataSkeleton label="Loading shipment history" /> : !loading ? <DispatchTable rows={rows} /> : null}</div></div>;
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

  async function documentAction(row: DispatchSummary, mode: 'view' | 'download') {
    setMessage('');
    try { await openDispatchDocument(row.id, mode); }
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
      <td className="table-cell" data-label="Parcel"><span><strong>{row.items.reduce((sum, item) => sum + item.quantity, 0)} parcel item(s)</strong><small>{new Date(row.createdAt).toLocaleDateString()}</small></span></td>
      <td className="table-cell" data-label="Rider"><span><strong>{assignment?.rider.user.displayName ?? 'Not assigned'}</strong>{isAdmin && riderAssignableStatuses.includes(row.status) && <button className="assign-rider-button" onClick={() => void openAssignment(row)} type="button"><Icon name={assignment ? 'swap_horiz' : 'person_add'} /> {assignment ? 'Change rider' : 'Choose rider'}</button>}</span></td>
      <td className="table-cell" data-label="Status"><span><span className={`status-badge ${statusClass(row.status)}`}>{label(row.status)}</span>{isAdmin && <button className="assign-rider-button" onClick={() => { setCorrectingRow(row); setCorrectionStatus(''); setCorrectionReason(''); }} type="button"><Icon name="edit" /> Correct status</button>}</span></td>
      <td className="table-cell document-actions" data-label="Actions"><div className="shipment-row-actions"><button onClick={() => void documentAction(row, 'view')} type="button"><Icon name="visibility" /> View PDF</button><button onClick={() => void documentAction(row, 'download')} type="button"><Icon name="download" /> Download</button><a href={`/track/${encodeURIComponent(row.cnNumber)}${row.publicTrackingKey ? `?key=${encodeURIComponent(row.publicTrackingKey)}` : ''}`} target="_blank" rel="noreferrer"><Icon name="share_location" /> Customer tracking</a><button onClick={() => { sessionStorage.setItem('swiftlog.tracking-query', row.cnNumber); window.dispatchEvent(new CustomEvent('swiftlog.open-tracking')); }} type="button"><Icon name="manage_search" /> Details</button></div></td>
    </tr>;
  })}</tbody></table></div>{assigningRow && typeof document !== 'undefined' && createPortal(<div className="assignment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssigningRow(null); }} role="presentation"><section aria-labelledby="assign-rider-title" aria-modal="true" className="assignment-panel" role="dialog"><header><div><span className="eyebrow">RIDER WORKLOAD</span><h3 id="assign-rider-title">Assign {assigningRow.cnNumber}</h3><p>Recommended by Lahore delivery area, availability, and current parcel load.</p></div><button aria-label="Close rider assignment" className="icon-button" onClick={() => setAssigningRow(null)} type="button"><Icon name="close" /></button></header>{loadingRiders ? <BikeLoader label="Checking rider workload" /> : <div className="rider-recommendations">{recommendations.map((rider, index) => { const isMe = rider.user.id === getSession()?.user.id; return <article className={rider.areaMatched && !rider.atCapacity && rider.availability === 'AVAILABLE' ? 'recommended' : ''} key={rider.id}><div className="recommendation-rank">{index + 1}</div><div className="rider-choice-main"><strong>{rider.user.displayName}{isMe ? ' (You)' : ''}</strong><small>{rider.employeeCode}{rider.serviceAreas.length ? ` | ${rider.serviceAreas.join(', ')}` : ' | All Lahore'}</small><div><span>{rider.activeParcels} active</span><span>{rider.remainingCapacity} spaces left</span>{rider.areaMatched && <b><Icon name="location_on" /> {rider.matchedArea} match</b>}</div></div><span className={`availability ${rider.availability.toLowerCase()}`}>{rider.availability.replaceAll('_', ' ')}</span><button className="button primary" disabled={rider.atCapacity || rider.availability === 'OFF_DUTY'} onClick={() => void assign(assigningRow, rider.id)} type="button">Assign</button></article>; })}{!recommendations.length && <div className="state-panel"><h3>No active riders</h3><p>Create or activate a rider before assigning this shipment.</p></div>}</div>}</section></div>, document.body)}{correctingRow && typeof document !== 'undefined' && createPortal(<div className="assignment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCorrectingRow(null); }} role="presentation"><form aria-labelledby="correct-status-title" aria-modal="true" className="assignment-panel correction-panel" onSubmit={updateStatus} role="dialog"><header><div><span className="eyebrow">ADMINISTRATIVE CORRECTION</span><h3 id="correct-status-title">Correct {correctingRow.cnNumber}</h3><p>This writes a permanent tracking and audit record.</p></div><button aria-label="Close status correction" className="icon-button" onClick={() => setCorrectingRow(null)} type="button"><Icon name="close" /></button></header><div className="correction-fields"><label className="field"><span>Current status</span><input disabled value={label(correctingRow.status)} /></label><label className="field"><span>Correct status</span><select onChange={(event) => setCorrectionStatus(event.target.value)} required value={correctionStatus}><option value="">Select corrected status</option>{adminStatuses.filter((status) => status !== correctingRow.status).map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label><label className="field"><span>Reason for correction</span><textarea autoFocus minLength={4} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain what was entered incorrectly" required value={correctionReason} /></label><div className="correction-actions"><button className="button secondary" onClick={() => setCorrectingRow(null)} type="button">Cancel</button><button className="button primary" disabled={!correctionStatus || correctionReason.trim().length < 4} type="submit">Save correction</button></div></div></form></div>, document.body)}</>;
}

export function TrackingView({ onBack }: { onBack: () => void }) {
  const [cn, setCn] = useState(''); const [result, setResult] = useState<TrackingResult | null>(null); const [message, setMessage] = useState('');
  const [query, setQuery] = useState(''); const [loading, setLoading] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => { const queued = sessionStorage.getItem('swiftlog.tracking-query'); if (queued) { setCn(queued); setQuery(queued); sessionStorage.removeItem('swiftlog.tracking-query'); } }, []);
  useEffect(() => {
    if (!query) return;
    let cancelled = false; setMessage(''); setResult(null); setLoading(true);
    trackDispatch(query).then((data) => { if (!cancelled) setResult(data); }).catch((error: ApiError) => { if (!cancelled) setMessage(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, attempt]);
  async function submit(e: React.FormEvent) { e.preventDefault(); setQuery(cn.trim()); setAttempt((n) => n + 1); }
  return <div className="page-content"><div className="page-header"><div><span className="eyebrow">TRACKING</span><h2>Track a dispatch</h2><p>Search by permanent CN to see its state and complete history.</p></div><button className="button subtle" onClick={onBack} type="button"><Icon name="arrow_back" /> Back to shipments</button></div><form className="surface-panel tracking-search" onSubmit={submit}><input value={cn} onChange={(e) => setCn(e.target.value.toUpperCase())} placeholder="CN-TEZGAM-2026-000002" required /><button className="button primary">Track dispatch</button></form>{message && <div className="error-callout">{message}</div>}{loading && <p role="status">Loading shipment…</p>}{result && !result.found && <div className="surface-panel state-panel"><h3>CN not found</h3><p>Check the number and try again.</p></div>}{result?.found && <section className="surface-panel tracking-result"><div className="panel-heading"><div><span className="eyebrow">{result.shipment.cnNumber}</span><h3>{label(result.shipment.status)}</h3></div><span className={`status-badge ${statusClass(result.shipment.status)}`}>{label(result.shipment.status)}</span></div><div className="journey">{result.shipment.events.map((event, index) => <div className="journey-step" key={`${event.eventTime}-${index}`}><i /><div><strong>{label(event.eventType)}</strong><p>{event.remarks || 'Status recorded'}</p><small>{new Date(event.eventTime).toLocaleString()}</small></div></div>)}</div></section>}</div>;
}
