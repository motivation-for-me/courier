'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCustomers, getShopPayable, payShopBalance, type ShopPayable } from '../lib/api';
export function ShopPayments() {
  const [shops, setShops] = useState<Array<{ id: string; name: string }>>([]), [id, setId] = useState(''), [detail, setDetail] = useState<ShopPayable | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [version, setVersion] = useState(0), [message, setMessage] = useState('');
  useEffect(() => { let active = true; getCustomers().then((rows) => { if (active) setShops(rows); }).catch((reason: Error) => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; setDetail(null); setError(''); if (id) getShopPayable(id).then((data) => { if (active) setDetail(data); }).catch((reason: Error) => { if (active) setError(reason.message); }); return () => { active = false; }; }, [id, version]);
  async function pay() {
    if (!detail || !window.confirm(`Have you paid ${detail.currencyCode} ${detail.netPayable} to ${detail.shop.name}?`)) return;
    setBusy(true); setError(''); setMessage('');
    try { await payShopBalance(id, detail.netPayable, detail.currencyCode); setMessage('Payment recorded. It is now included in Reports.'); setVersion((value) => value + 1); } catch (reason) { setError((reason as Error).message); try { setDetail(await getShopPayable(id)); } catch { /* Keep the original payment error visible. */ } } finally { setBusy(false); }
  }
  return <section className="surface-panel"><h3>Shop payments</h3><label className="field"><span>Shop</span><select disabled={busy} value={id} onChange={(event) => { setId(event.target.value); setMessage(''); }}><option value="">Choose a shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>{error && <p role="alert" className="error-callout">{error}</p>}{message && <p role="status">{message}</p>}{id && !detail && !error && <p role="status">Loading balance…</p>}{detail && <><div className="report-heading"><div><span>Net payable after delivery fees</span><h3>{detail.currencyCode} {detail.netPayable}</h3><p>{detail.shipments.length} unpaid shipments</p></div><button className="button primary" disabled={busy || Number(detail.netPayable) <= 0} onClick={() => void pay()}>{busy ? 'Recording…' : 'Pay shop'}</button></div><details><summary>Shipment breakdown</summary><dl>{detail.shipments.map((row) => <div className="report-heading" key={row.id}><dt>{row.cnNumber}</dt><dd>{detail.currencyCode} {row.netPayable}</dd></div>)}</dl></details><Link className="button subtle" href="/reports">View payment reports</Link></>}</section>;
}
