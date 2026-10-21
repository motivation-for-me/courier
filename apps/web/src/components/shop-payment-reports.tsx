'use client';
import { useEffect, useRef, useState } from 'react';
import { getReportShops, getSession, getShopPaymentReport, openShopPaymentReport, type ShopPaymentReport } from '../lib/api';

function today() { return new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10); }
function period(mode: string, month: string) {
  const date = today();
  if (mode === 'day') return { from: date, to: date };
  if (mode === 'week') { const first = new Date(`${date}T00:00:00Z`); first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7); const last = new Date(first); last.setUTCDate(last.getUTCDate() + 6); return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }; }
  const [year, number] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) };
}
export function ShopPaymentReports() {
  const admin = getSession()?.user.roles.includes('ADMIN');
  const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]), [shopId, setShopId] = useState('');
  const [mode, setMode] = useState('month'), [month, setMonth] = useState(today().slice(0, 7));
  const initial = period('month', today().slice(0, 7));
  const [from, setFrom] = useState(initial.from), [to, setTo] = useState(initial.to), [group, setGroup] = useState('day');
  const [query, setQuery] = useState(new URLSearchParams({ ...initial, group: 'day' }).toString());
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<ShopPaymentReport | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [pdfBusy, setPdfBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => { let active = true; getReportShops().then((rows) => { if (active) setShops(rows); }).catch((reason: Error) => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  useEffect(() => { const request = ++sequence.current; setLoading(true); setError(''); setResult(null); getShopPaymentReport(query).then((data) => { if (request === sequence.current) setResult(data); }).catch((reason: Error) => { if (request === sequence.current) setError(reason.message); }).finally(() => { if (request === sequence.current) setLoading(false); }); return () => { ++sequence.current; }; }, [query, version]);
  function choose(next: string, nextMonth = month) { setMode(next); if (next !== 'custom') { const dates = period(next, nextMonth); setFrom(dates.from); setTo(dates.to); setGroup(next === 'month' ? 'day' : next); } }
  async function pdf(action: 'view' | 'download') { setPdfBusy(true); setError(''); try { await openShopPaymentReport(query, action); } catch (reason) { setError((reason as Error).message); } finally { setPdfBusy(false); } }
  return <div className="page-content shop-report-page"><div className="page-header"><div><span className="eyebrow">REPORTS</span><h2>Shop payment reports</h2><p>Payments recorded from the admin, after delivery-fee deductions.</p></div></div>
    <form className="surface-panel report-filters" onSubmit={(event) => { event.preventDefault(); setQuery(new URLSearchParams({ from, to, group, ...(shopId ? { shopId } : {}) }).toString()); setVersion((value) => value + 1); }}>
      {admin && <label className="field"><span>Shop</span><select value={shopId} onChange={(event) => setShopId(event.target.value)}><option value="">All shops</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>}
      <label className="field"><span>Period</span><select value={mode} onChange={(event) => choose(event.target.value)}><option value="day">Today</option><option value="week">This week</option><option value="month">Select month</option><option value="custom">Custom range</option></select></label>
      {mode === 'month' && <label className="field"><span>Month</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); if (event.target.value) choose('month', event.target.value); }} required /></label>}
      <label className="field"><span>From</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setMode('custom'); }} required /></label><label className="field"><span>To</span><input type="date" min={from} value={to} onChange={(event) => { setTo(event.target.value); setMode('custom'); }} required /></label>
      <label className="field"><span>Group by</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label><button className="button primary" disabled={loading}>View report</button>
    </form>
    {error && <p className="error-callout" role="alert">{error}</p>}{loading && <p role="status">Loading report…</p>}
    {result && <><div className="report-heading"><p>{result.from} — {result.to} · Pakistan time · Payment date</p><div className="workspace-actions"><button className="button subtle" disabled={pdfBusy} onClick={() => void pdf('view')}>View PDF</button><button className="button subtle" disabled={pdfBusy} onClick={() => void pdf('download')}>{pdfBusy ? 'Preparing…' : 'Download PDF'}</button></div></div>
      <section className="report-totals">{result.totals.map((total) => <article className="surface-panel" key={total.currencyCode}><span>Net received · {total.currencyCode}</span><strong>{total.netReceived}</strong><small>{total.payments} payments · {total.shipments} shipments</small></article>)}</section>
      {!result.payments.length ? <section className="surface-panel"><h3>No payments in this period</h3><p>Only recorded shop payouts appear here. Pending amounts are not counted as received.</p></section> : <><section className="surface-panel"><h3>Period summary</h3><div className="table-wrap"><table className="report-table"><thead><tr><th>{result.group === 'week' ? 'Week starting Monday' : 'Period'}</th><th>Payments</th><th>Net received</th></tr></thead><tbody>{result.periods.map((row) => <tr key={`${row.period}-${row.currencyCode}`}><td>{row.period}</td><td>{row.payments}</td><td>{row.currencyCode} {row.netReceived}</td></tr>)}</tbody></table></div></section>
      <section className="surface-panel"><h3>Payments received</h3>{result.payments.map((payment) => <details className="report-payment" key={payment.id}><summary><span>{new Date(payment.paidAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi' })}</span><strong>{payment.shop.name}</strong><b>{payment.currencyCode} {payment.netReceived}</b><span>{payment.shipments.length} shipments</span></summary><dl>{payment.shipments.map((shipment, index) => <div key={`${shipment.cnNumber}-${index}`}><dt>{shipment.cnNumber}</dt><dd>{payment.currencyCode} {shipment.netReceived}</dd></div>)}</dl></details>)}</section></>}
    </>}
  </div>;
}
