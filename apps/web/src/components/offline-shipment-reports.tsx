'use client';

import { useEffect, useMemo, useState } from 'react';
import { getConsignmentPage, type DispatchSummary } from '../lib/api';

type Range = 'day' | 'week' | 'month' | 'custom';

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeDates(range: Range, month: string) {
  const now = new Date();
  const today = isoDate(now);
  if (range === 'day') return { from: today, to: today };
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: isoDate(start), to: isoDate(end) };
  }
  if (range === 'month') {
    const [year, monthNumber] = month.split('-').map(Number);
    return { from: `${month}-01`, to: isoDate(new Date(Date.UTC(year, monthNumber, 0))) };
  }
  return { from: today, to: today };
}

export function downloadOfflinePdf(title: string, lines: string[]) {
  const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const content = ['BT', '/F1 14 Tf', '50 760 Td', `(${escape(title)}) Tj`, '/F1 10 Tf', ...lines.slice(0, 45).map((line, index) => `0 -${index === 0 ? 24 : 16} Td (${escape(line)}) Tj`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  link.download = 'bcs-offline-shipment-report.pdf';
  link.click();
  URL.revokeObjectURL(link.href);
}

export function OfflineShipmentReports() {
  const [range, setRange] = useState<Range>('month');
  const [month, setMonth] = useState(isoDate(new Date()).slice(0, 7));
  const initial = rangeDates('month', month);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [rows, setRows] = useState<DispatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineEvent = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offlineEvent);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent); };
  }, []);

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const [active, history] = await Promise.all([
        getConsignmentPage('?page=1&limit=100&scope=active'),
        getConsignmentPage('?page=1&limit=100&scope=history'),
      ]);
      setRows([...active.items, ...history.items]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Shipment report data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter((row) => {
    const date = row.createdAt.slice(0, 10);
    return date >= from && date <= to;
  }), [from, rows, to]);
  const statusCounts = useMemo(() => filtered.reduce<Record<string, number>>((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {}), [filtered]);
  const branchCounts = useMemo(() => filtered.reduce<Record<string, number>>((counts, row) => { const name = row.project?.name ?? row.customer?.name ?? 'Unassigned'; counts[name] = (counts[name] ?? 0) + 1; return counts; }, {}), [filtered]);
  const riderCounts = useMemo(() => filtered.reduce<Record<string, number>>((counts, row) => { const name = row.assignments[0]?.rider.user.displayName ?? 'Unassigned'; counts[name] = (counts[name] ?? 0) + 1; return counts; }, {}), [filtered]);

  function chooseRange(next: Range) {
    setRange(next);
    if (next !== 'custom') {
      const dates = rangeDates(next, month);
      setFrom(dates.from);
      setTo(dates.to);
    }
  }

  const pdfLines = [
    `Range: ${from} to ${to}`,
    `Source: ${offline ? 'Offline cached records' : 'Synchronized records'}`,
    `Total shipments: ${filtered.length}`,
    ...Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`),
    ...Object.entries(branchCounts).map(([branch, count]) => `Customer/branch ${branch}: ${count}`),
    ...Object.entries(riderCounts).map(([rider, count]) => `Rider ${rider}: ${count}`),
  ];

  return <section className="surface-panel offline-shipment-reports">
    <div className="panel-heading"><div><span className="eyebrow">SHIPMENT REPORTS</span><h3>{offline ? 'Offline shipment report' : 'Shipment report'}</h3><p>{offline ? 'Using locally synchronized records. Latest updates may be missing.' : 'The same report remains available from cached records when disconnected.'}</p></div><button className="button subtle" onClick={() => downloadOfflinePdf('BCS shipment report', pdfLines)} disabled={!filtered.length}>Download PDF</button></div>
    <form className="report-filters" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label className="field"><span>Period</span><select value={range} onChange={(event) => chooseRange(event.target.value as Range)}><option value="day">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom range</option></select></label>
      {range === 'month' && <label className="field"><span>Month</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); const dates = rangeDates('month', event.target.value); setFrom(dates.from); setTo(dates.to); }} /></label>}
      <label className="field"><span>From</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setRange('custom'); }} /></label>
      <label className="field"><span>To</span><input type="date" value={to} min={from} onChange={(event) => { setTo(event.target.value); setRange('custom'); }} /></label>
      <button className="button primary" type="submit">Refresh data</button>
    </form>
    {message && <p className="error-callout" role="alert">{message}</p>}
    {loading ? <p role="status">Loading cached shipment records…</p> : <><div className="report-totals"><article className="surface-panel"><span>Total shipments</span><strong>{filtered.length}</strong><small>{from} — {to}</small></article>{Object.entries(statusCounts).map(([status, count]) => <article className="surface-panel" key={status}><span>{status.replaceAll('_', ' ')}</span><strong>{count}</strong><small>Cached shipment records</small></article>)}</div><div className="report-columns"><ReportGroup title="By customer / branch" values={branchCounts} /><ReportGroup title="By rider" values={riderCounts} /></div></>}
  </section>;
}

function ReportGroup({ title, values }: { title: string; values: Record<string, number> }) {
  return <div className="surface-panel"><h3>{title}</h3>{Object.entries(values).length ? <ul className="report-list">{Object.entries(values).map(([name, count]) => <li key={name}><span>{name}</span><strong>{count}</strong></li>)}</ul> : <p>No cached records in this range.</p>}</div>;
}
