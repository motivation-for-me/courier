'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { syncRiderDeliveryFees, saveRiderDefaultFee, payAllRiderEarnings, amendRiderEarning, confirmRiderPayment, getPaymentRiders, getRiderPayments, getSession, recordRiderEarning, sendRiderPayment, type RiderPaymentDetail, type RiderPaymentEntry, type RiderPaymentRider, type RiderPaymentTotal } from '../lib/api';

const labels: Record<string, string> = { PENDING: 'Unpaid', SENT: 'Awaiting receipt', DISPUTED: 'Disputed', PAID: 'Cleared', VOIDED: 'Voided' };
function cents(value: string) { const [whole, fraction = ''] = value.split('.'); return BigInt(whole || '0') * BigInt(100) + BigInt(fraction.padEnd(2, '0').slice(0, 2)); }
function money(value: bigint) { return `${value / BigInt(100)}.${(value % BigInt(100)).toString().padStart(2, '0')}`; }
function Totals({ rows }: { rows: RiderPaymentTotal[] }) {
  const currencies = Array.from(new Set(rows.map((row) => row.currencyCode)));
  return <div className="payment-balance-groups">{currencies.map((currency) => {
    const matching = rows.filter((row) => row.currencyCode === currency);
    const total = money(matching.filter((row) => row.status !== 'VOIDED').reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0)));
    return <section className="payment-balance-group" key={currency}><div className="payment-balance-heading"><h4>{currency} balance</h4><span>Total earnings <strong>{total}</strong></span></div><div className="payment-overview">{['PENDING', 'SENT', 'PAID', 'DISPUTED'].map((status) => {
      const values = matching.filter((row) => row.status === status);
      return <div key={status}><span>{labels[status]}</span><strong>{money(values.reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0)))}</strong><small>{values.reduce((sum, row) => sum + row._count._all, 0)} entries · {values.filter((row) => row.kind === 'DELIVERY').reduce((sum, row) => sum + row._count._all, 0)} deliveries</small></div>;
    })}</div><div className="payment-balance-footer"><span>{matching.filter((row) => row.kind === 'DELIVERY' && row.status !== 'VOIDED').reduce((sum, row) => sum + row._count._all, 0)} recorded deliveries</span><span>Unpaid bonuses: <strong>{money(matching.filter((row) => row.kind === 'BONUS' && row.status === 'PENDING').reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0)))}</strong></span></div></section>;
  })}</div>;
}
export function RiderPayments() {
  const user = getSession()?.user;
  const admin = !!user?.roles.includes('ADMIN');
  const [riders, setRiders] = useState<RiderPaymentRider[]>([]);
  const [id, setId] = useState(() => admin ? sessionStorage.getItem('swiftlog.payment-rider') || '' : user?.riderId || '');
  const [detail, setDetail] = useState<RiderPaymentDetail | null>(null);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]); const [reference, setReference] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  async function load() {
    const request = ++requestSequence.current;
    setLoading(true);
    try {
      if (admin) { const rows = await getPaymentRiders(); if (request !== requestSequence.current) return; setRiders(rows); }
      if (id) {
        let report = await getRiderPayments(id, page, status);
        if (request !== requestSequence.current) return;
        if (admin && (report.missingCount > 0 || report.unpricedCount > 0) && Number(report.rider.deliveryFee) > 0) { await syncRiderDeliveryFees(id); report = await getRiderPayments(id, page, status); }
        if (request !== requestSequence.current) return;
        setDetail(report);
      } else setDetail(null);
      setSelection([]);
    }
    catch (error) { if (request === requestSequence.current) setMessage(error instanceof Error ? error.message : 'Payments could not load.'); }
    finally { if (request === requestSequence.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { ++requestSequence.current; }; }, [id, page, status]);
  useEffect(() => { if (admin) return; const timer = window.setInterval(() => { if (!document.hidden && !busy) void load(); }, 30000); return () => window.clearInterval(timer); }, [id, page, status, busy, admin]);
  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return; setBusy(true); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Payment action failed.'); }
    finally { setBusy(false); }
  }
  const selected = detail?.entries.filter((entry) => selection.includes(entry.id)) || [];
  const selectionCurrencies = Array.from(new Set(selected.map((entry) => entry.currencyCode)));
  const selectionTotal = selected.reduce((sum, entry) => sum + cents(entry.amount), BigInt(0));
  const unpaid = detail?.totals.filter((row) => row.status === 'PENDING') || [];
  const unpaidTotal = unpaid.reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0));
  const unpaidCurrencies = Array.from(new Set(unpaid.map((row) => row.currencyCode)));
  const unpaidDeliveries = unpaid.filter((row) => row.kind === 'DELIVERY').reduce((sum, row) => sum + row._count._all, 0);
  const unpaidFees = unpaid.filter((row) => row.kind === 'DELIVERY').reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0));
  const unpaidBonuses = unpaid.filter((row) => row.kind === 'BONUS').reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0));
  const receiptAllowed = user?.riderId === id;
  const paymentDetails = detail?.rider.id === id && <div className="payment-account-details" id={`payment-account-${id}`} key={id}><section className="surface-panel"><h3>Balance overview</h3><Totals rows={detail.totals} />{!detail.totals.length && <p>No earnings recorded yet. Fees are recorded when a rider completes a delivery.</p>}
      {admin && unpaidTotal > BigInt(0) && <form className="payment-pay-action" onSubmit={(event) => { event.preventDefault(); if (window.confirm(`Have you paid ${unpaidCurrencies[0]} ${money(unpaidTotal)} to this rider?`)) void run(() => payAllRiderEarnings(id, reference), 'All unpaid fees and bonuses sent for rider confirmation.'); }}><h3>Ready to pay: {unpaidCurrencies.join(', ')} {money(unpaidTotal)}</h3><p>{unpaidDeliveries} unpaid deliveries: {money(unpaidFees)} + bonuses: {money(unpaidBonuses)} = {money(unpaidTotal)}</p><label className="field"><span>Payment reference / method</span><input value={reference} onChange={(event) => setReference(event.target.value)} required minLength={3} maxLength={200} placeholder="Cash payment note or bank reference" /></label><button className="button primary" disabled={busy || loading || (detail.missingCount > 0 || detail.unpricedCount > 0) || unpaidCurrencies.length !== 1}>Record payment sent</button></form>}
      {admin && <><details className="payment-setting"><summary>Delivery fee: {detail.rider.organization.currencyCode} {detail.rider.deliveryFee} per completed delivery · Configure / change</summary><MoneyForm label="Saved fee per completed delivery" amount={detail.rider.deliveryFee} busy={busy} reasonRequired={false} onSave={(amount) => run(() => saveRiderDefaultFee(id, amount), 'Delivery fee saved. Unpriced completed deliveries calculated; priced, sent and cleared amounts are unchanged.')} /><p>Saving applies this fee to unpriced completed deliveries and future deliveries. Previously priced fees keep their original rate.</p></details><details className="payment-setting"><summary>Add bonus</summary><MoneyForm label="Add rider bonus" busy={busy} onSave={(amount, reason) => run(() => recordRiderEarning(id, amount, reason), 'Bonus added to unpaid earnings.')} /></details></>}
    </section>
    {(Number(detail.rider.deliveryFee) <= 0 || detail.missingCount > 0) && <section className="surface-panel"><h3>Set the rider delivery fee once</h3><p>{detail.missingCount} completed deliveries need pricing. {admin ? "Save the agreed fee above; completed deliveries and future deliveries will use it automatically." : "Ask your administrator to save your agreed delivery fee."}</p></section>}
    <section className="surface-panel"><div className="history-filters"><h3>Delivery fees and bonuses</h3><select aria-label="Payment status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All payments</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><p>{detail.total} entries · Page {page} of {detail.pages}</p>
    {detail.entries.map((entry) => <details className="payment-record" key={entry.id}><summary className="payment-record-summary"><span className="payment-chevron" aria-hidden="true">›</span><strong>{entry.kind === 'BONUS' ? 'Bonus' : entry.consignment?.cnNumber || 'Delivery fee'}</strong><span className="payment-record-amount">{entry.currencyCode} {entry.amount}</span><span className={`payment-state payment-state-${entry.status.toLowerCase()}`}>{entry.status === 'PAID' && !entry.confirmedAt ? 'Previously paid — legacy record' : labels[entry.status]}</span><time>{new Date(entry.createdAt).toLocaleDateString()}</time></summary><div className="payment-record-details"><dl className="payment-metadata"><div><dt>Recorded</dt><dd>{new Date(entry.createdAt).toLocaleString()}</dd></div><div><dt>Payment reference / method</dt><dd>{entry.reference || 'Not recorded'}</dd></div></dl>{entry.note && <p>{entry.note}</p>}{entry.sentAt && <p>Admin recorded payment: {new Date(entry.sentAt).toLocaleString()} · {entry.sentById}</p>}{entry.confirmedAt && <p>Rider confirmed: {new Date(entry.confirmedAt).toLocaleString()} · {entry.confirmedById}</p>}
    {entry.consignment && <details><summary>Delivery information</summary><p>Delivered: {entry.consignment.deliveredAt ? new Date(entry.consignment.deliveredAt).toLocaleString() : 'Not recorded'}</p><p>{entry.consignment.serviceType}</p>{entry.consignment.parties.map((party, index) => <p key={index}>{party.kind}: {party.name}</p>)}{entry.consignment.addresses.map((address, index) => <p key={index}>{address.kind}: {address.addressLine}, {address.city}</p>)}</details>}
    {admin && ['PENDING', 'DISPUTED'].includes(entry.status) && <label><input type="checkbox" checked={selection.includes(entry.id)} onChange={(event) => setSelection((previous) => event.target.checked ? [...previous, entry.id] : previous.filter((value) => value !== entry.id))} /> {entry.status === 'DISPUTED' ? 'Select after resolving non-receipt' : 'Select for payment'}</label>}
    {admin && entry.status === 'PENDING' && <details><summary>Adjust this entry (optional)</summary><MoneyForm label="Edit unpaid fee / bonus" amount={entry.amount} busy={busy} onSave={(amount, reason) => run(() => amendRiderEarning(id, entry.id, amount, reason), 'Unpaid amount updated and logged.')} /></details>}
    {receiptAllowed && entry.status === 'SENT' && <Receipt entry={entry} busy={busy} onDecision={(decision, reason) => run(() => confirmRiderPayment(entry.id, decision, reason), decision === 'confirm' ? 'Receipt confirmed. This payment is cleared.' : 'Non-receipt reported to the administrator.')} />}
    </div></details>)}{!detail.entries.length && <p>No payment entries match this filter.</p>}
    <div className="workspace-actions"><button className="button subtle" disabled={page === 1 || busy} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><button className="button subtle" disabled={page >= detail.pages || busy} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>
    {admin && selected.length > 0 && <form onSubmit={(event) => { event.preventDefault(); if (selectionCurrencies.length !== 1) { setMessage('Select one currency at a time.'); return; } if (window.confirm(`Have you already paid ${selectionCurrencies[0]} ${money(selectionTotal)} to this rider? This records the payment; it does not transfer money.`)) void run(() => sendRiderPayment(id, selection, reference), 'Payment sent for rider confirmation.'); }}><h3>Selected: {selected.length} entries · {selectionCurrencies.join(', ')} {money(selectionTotal)}</h3><label className="field"><span>Payment reference / method</span><input value={reference} onChange={(event) => setReference(event.target.value)} minLength={3} maxLength={200} required placeholder="Bank reference or cash payment note" /></label><button className="button primary" disabled={busy || selectionCurrencies.length !== 1} type="submit">Pay selected</button></form>}
    </section><details className="payment-activity"><summary>Payment activity <span>{detail.log.length} recent actions</span></summary><div>{detail.log.map((event) => <details key={event.id}><summary>{event.action.replaceAll('rider-payment.', '').replaceAll('_', ' ')} · {new Date(event.createdAt).toLocaleString()}</summary><p>Recorded by {event.actorId}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(event.newValues, null, 2)}</pre></details>)}{!detail.log.length && <p>No payment actions recorded yet.</p>}</div></details></div>;
  const visibleRiders = riders.filter((rider) => `${rider.user.displayName} ${rider.user.email} ${rider.employeeCode}`.toLowerCase().includes(search.toLowerCase()));
  function toggleAccount(nextId: string) {
    if (busy) return;
    ++requestSequence.current;
    setId(id === nextId ? '' : nextId); setDetail(null); setSelection([]); setReference(''); setMessage(''); setPage(1); setStatus('');
    if (admin) { if (id === nextId) sessionStorage.removeItem('swiftlog.payment-rider'); else sessionStorage.setItem('swiftlog.payment-rider', nextId); }
  }
  return <div className="page-content rider-payments-page payment-workspace">
    <div className="page-header"><div><span className="eyebrow">PAYMENTS</span><h2>{admin ? 'Rider payments' : 'My payments'}</h2><p>{admin ? 'Manage balances, fees and payment confirmations.' : 'Your earnings and payment confirmations.'}</p></div><button className="button subtle" disabled={busy || loading} onClick={() => void load()} type="button">Refresh</button></div>
    {message && <div className="management-message" role="status">{message}</div>}
    <section className="surface-panel payment-accounts" aria-label="Payment accounts">
      {admin && <div className="payment-account-toolbar"><label className="field"><span>Search riders</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or employee code" /></label><span>{visibleRiders.length} accounts</span></div>}
      {admin ? visibleRiders.map((rider) => <Fragment key={rider.id}><button className={`payment-account-row ${id === rider.id ? 'expanded' : ''}`} aria-expanded={id === rider.id} aria-controls={`payment-account-${rider.id}`} disabled={busy} onClick={() => toggleAccount(rider.id)} type="button"><span className="payment-chevron" aria-hidden="true">›</span><span className="payment-account-name"><strong>{rider.user.displayName}</strong><small>{rider.employeeCode} · {rider.user.email}{!rider.isActive && ' · Inactive'}</small></span><AccountBalances rows={rider.totals} /></button>{id === rider.id && <div className="payment-account-region" role="region" aria-label={`${rider.user.displayName} payment details`}>{loading && !detail && <p className="payment-loading" role="status">Loading payment details…</p>}{paymentDetails}</div>}</Fragment>) : <><button className={`payment-account-row ${id ? 'expanded' : ''}`} aria-expanded={!!id} disabled={busy} onClick={() => toggleAccount(user?.riderId || '')} type="button"><span className="payment-chevron" aria-hidden="true">›</span><span className="payment-account-name"><strong>{user?.displayName}</strong><small>Your payment records</small></span></button>{id && <div className="payment-account-region" role="region" aria-label="My payment details">{loading && !detail && <p role="status">Loading payment details…</p>}{paymentDetails}</div>}</>}
      {admin && loading && !riders.length && <p className="payment-loading" role="status">Loading accounts…</p>}
      {admin && !loading && !visibleRiders.length && <p className="payment-empty">{search ? 'No riders match your search.' : message ? 'Accounts could not load. Try Refresh.' : 'No rider accounts found.'}</p>}
    </section>
  </div>;
}
function AccountBalances({ rows }: { rows: RiderPaymentTotal[] }) {
  const currencies = Array.from(new Set(rows.map((row) => row.currencyCode)));
  return <span className="payment-account-balances">{currencies.length ? currencies.map((currency) => <span key={currency}><small>{currency}</small>{['PENDING', 'SENT', 'PAID'].map((status) => <span key={status}><small>{status === 'PENDING' ? 'Unpaid' : status === 'SENT' ? 'Awaiting receipt' : 'Cleared'}</small><strong>{money(rows.filter((row) => row.currencyCode === currency && row.status === status).reduce((sum, row) => sum + cents(row._sum.amount || '0'), BigInt(0)))}</strong></span>)}</span>) : <small>No earnings yet</small>}</span>;
}
function MoneyForm({ label, amount = '', busy, onSave, reasonRequired = true }: { label: string; amount?: string; busy: boolean; reasonRequired?: boolean; onSave: (amount: string, reason: string) => Promise<void> }) {
  return <form key={`${label}-${amount}`} className="compact-form-grid" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void onSave(String(form.get('amount')), String(form.get('reason') || 'Default delivery fee updated')); }}><label className="field"><span>{label}</span><input name="amount" defaultValue={amount} inputMode="decimal" pattern="(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?" required placeholder="0.00" /></label>{reasonRequired && <label className="field"><span>Reason</span><input name="reason" minLength={3} maxLength={500} required /></label>}<button className="button subtle" disabled={busy} type="submit">Save</button></form>;
}
function Receipt({ entry, busy, onDecision }: { entry: RiderPaymentEntry; busy: boolean; onDecision: (decision: 'confirm' | 'dispute', reason?: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  return <div><p>Have you received {entry.currencyCode} {entry.amount}? Confirm only after receiving the money.</p><button className="button primary" disabled={busy} onClick={() => { if (window.confirm(`Confirm you received ${entry.currencyCode} ${entry.amount}?`)) void onDecision('confirm'); }} type="button">Yes, I received it</button><label className="field"><span>If not received, explain the problem</span><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label><button className="button subtle" disabled={busy || !reason.trim()} onClick={() => void onDecision('dispute', reason)} type="button">Not received — notify admin</button></div>;
}
