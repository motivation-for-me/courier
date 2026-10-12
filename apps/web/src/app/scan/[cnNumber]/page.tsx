import Link from 'next/link';

export default async function ParcelScanPage({ params }: { params: Promise<{ cnNumber: string }> }) {
  const { cnNumber } = await params;
  return <main className="login-page"><section className="login-card">
    <div className="login-wordmark">Swift<span>Log</span></div>
    <h1>Open parcel</h1><p>{cnNumber}</p>
    <p>Select rider access to sign in with your account and manage your assigned parcel.</p>
    <Link className="button primary login-submit" href={`/?scan=${encodeURIComponent(cnNumber)}`}>Rider access</Link>
    <p><Link className="button subtle" href={`/track/${encodeURIComponent(cnNumber)}`}>Customer tracking</Link></p>
  </section></main>;
}
