'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { resetAccountPassword, verifyAccountEmail } from '../lib/api';

export function AccountLink({ reset = false }: { reset?: boolean }) {
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (reset && form.get('password') !== form.get('confirm')) { setMessage('Passwords do not match.'); return; }
    setBusy(true); setMessage('');
    try { const result = reset ? await resetAccountPassword(token, String(form.get('password'))) : await verifyAccountEmail(token); setMessage(result.message); setDone(true); setToken(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'This request could not be completed.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-card"><div className="login-wordmark">Swift<span>Log</span></div><h1>{reset ? 'Set a new password' : 'Verify email'}</h1>{message && <p role="status">{message}</p>}{!done && (token ? <form onSubmit={submit}>{reset ? <><label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label><label className="field"><span>Confirm password</span><input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label></> : <p>Confirm that you own the email address associated with this account.</p>}<button className="button primary" disabled={busy} type="submit">{busy ? 'Please wait…' : reset ? 'Update password' : 'Verify email'}</button></form> : <p>Open the link from your email. If it has expired, request a new one from the sign-in page.</p>)}<Link href="/">Return to sign in</Link></section></main>;
}
