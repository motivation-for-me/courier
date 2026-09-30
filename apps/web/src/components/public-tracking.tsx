'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { trackDispatch, type ApiError, type TrackingResult } from '../lib/api';

const stages = [
  { status: 'CONFIRMED', label: 'Order confirmed', note: 'Shipment details verified' },
  { status: 'ASSIGNED_TO_RIDER', label: 'Rider assigned', note: 'Pickup rider confirmed' },
  { status: 'DISPATCHED', label: 'Parcel picked up', note: 'Parcel entered delivery network' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery', note: 'Rider is heading to you' },
  { status: 'DELIVERED', label: 'Delivered', note: 'Parcel delivered successfully' },
];

const statusLabel = (status: string) => status.replaceAll('_', ' ').toLowerCase();

export function PublicTracking() {
  const params = useParams<{ cnNumber: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const cnNumber = decodeURIComponent(params.cnNumber ?? '').toUpperCase();
  const key = searchParams.get('key') ?? undefined;
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    trackDispatch(cnNumber, key).then(setResult).catch((requestError: ApiError) => setError(requestError.message)).finally(() => setLoading(false));
  }, [cnNumber, key]);

  const shipment = result?.found ? result.shipment : null;
  const currentIndex = useMemo(() => {
    if (!shipment) return -1;
    if (shipment.status === 'DRAFT') return -1;
    if (shipment.status.includes('FAILED') || shipment.status === 'RETURNED') return 3;
    return stages.findIndex((stage) => stage.status === shipment.status);
  }, [shipment]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextCn = String(form.get('cnNumber') ?? '').trim().toUpperCase();
    if (nextCn) router.push(`/track/${encodeURIComponent(nextCn)}`);
  }

  return <main className="public-track-page">
    <header className="public-track-nav"><a href="/" className="public-wordmark">Swift<span>Log</span></a><form onSubmit={search}><input aria-label="Consignment number" defaultValue={cnNumber} name="cnNumber" placeholder="Enter CN number" required /><button type="submit">Track</button></form></header>
    <section className="track-hero"><div><span className="track-kicker">LIVE DELIVERY</span><h1>{loading ? 'Finding your parcel' : shipment ? shipment.status === 'DELIVERED' ? 'Delivered safely' : 'Your parcel is moving' : 'Shipment not found'}</h1><p>{shipment ? `Latest update from ${shipment.organization?.name || 'SwiftLog'}` : 'Enter the CN printed on your parcel label.'}</p></div>{shipment && <div className="track-reference"><span>Consignment number</span><strong>{shipment.cnNumber}</strong><small>Updated {new Date(shipment.currentStatusAt).toLocaleString()}</small></div>}</section>

    {loading && <section className="track-loading" aria-label="Loading tracking details"><i /><i /><i /></section>}
    {error && <section className="track-message"><strong>Tracking unavailable</strong><p>{error}</p></section>}
    {result && !result.found && <section className="track-message"><strong>We could not find that CN</strong><p>Check the number on the label and search again.</p></section>}

    {shipment && <>
      <section className="track-progress" aria-label={`Current status: ${statusLabel(shipment.status)}`}>
        <div className="track-progress-heading"><div><span>Delivery progress</span><h2>{statusLabel(shipment.status)}</h2></div><b>{shipment.serviceType.replaceAll('_', ' ')}</b></div>
        <ol>{stages.map((stage, index) => <li className={index === currentIndex ? 'current' : ''} key={stage.status}><div className="stage-marker"><i>{index + 1}</i>{index < stages.length - 1 && <span />}</div><div><strong>{stage.label}</strong><small>{stage.note}</small>{index === currentIndex && <em>Current stage</em>}</div></li>)}</ol>
      </section>

      <div className={`track-info-grid ${shipment.status !== 'OUT_FOR_DELIVERY' ? 'single' : ''}`}>
        <section className="track-delivery-card"><span className="track-card-label">DELIVERY DETAILS</span><h2>{shipment.receiver?.name ?? 'Receiver details protected'}</h2>{shipment.receiver?.phone && <a href={`tel:${shipment.receiver.phone}`}>{shipment.receiver.phone}</a>}{shipment.destination && <address>{shipment.destination.addressLine}{shipment.destination.city ? `, ${shipment.destination.city}` : ''}</address>}{shipment.destination?.landmark && <p><b>Landmark</b>{shipment.destination.landmark}</p>}{shipment.destination?.deliveryNote && <p><b>Delivery note</b>{shipment.destination.deliveryNote}</p>}{!key && <small className="privacy-note">Contact and address details are available through the secure link shared by the courier.</small>}</section>
        {shipment.status === 'OUT_FOR_DELIVERY' && <section className={`track-rider-card ${shipment.rider ? 'assigned' : ''}`}><span className="track-card-label">YOUR RIDER</span>{shipment.rider ? <><div className="rider-avatar">{shipment.rider.user.displayName.slice(0, 1).toUpperCase()}</div><h2>{shipment.rider.user.displayName}</h2><p>Courier rider · {shipment.rider.employeeCode}</p>{shipment.rider.vehicleDetails?.vehicleNumber && <small>Vehicle {shipment.rider.vehicleDetails.vehicleNumber}</small>}{shipment.rider.user.phone && <a className="rider-call" href={`tel:${shipment.rider.user.phone}`}>Call rider · {shipment.rider.user.phone}</a>}</> : <><div className="rider-avatar waiting">···</div><h2>Rider details unavailable</h2><p>The courier has not published rider contact details.</p></>}</section>}
      </div>

      <section className="track-history"><div><span className="track-card-label">TRACKING HISTORY</span><h2>Parcel updates</h2></div><div>{shipment.events.slice().reverse().map((event, index) => <article key={`${event.eventTime}-${index}`}><i /><div><strong>{statusLabel(event.eventType)}</strong><p>{event.remarks || 'Shipment status updated'}</p><time>{new Date(event.eventTime).toLocaleString()}</time></div></article>)}</div></section>
    </>}
    <footer className="public-track-footer"><span>SwiftLog courier operations</span><span>Keep your CN for delivery support</span></footer>
  </main>;
}
