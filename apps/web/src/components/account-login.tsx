'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { getAuthConfig, login, loginWithGoogle, requestAccountEmail, type AuthSession } from '../lib/api';

declare global {
  interface Window {
    google?: { accounts: { id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(element: HTMLElement, options: { theme: string; size: string; width: number }): void;
    } } };
  }
}

export function AccountLogin({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<'login' | 'reset' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<{ googleClientId: string | null; emailEnabled: boolean } | null>(null);
  const googleButton = useRef<HTMLDivElement>(null);
  useEffect(() => { getAuthConfig().then(setConfig).catch((error: Error) => setMessage(error.message)); }, []);

  function initializeGoogle() {
    if (!config?.googleClientId || !googleButton.current || !window.google) return;
    window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: async ({ credential }) => {
      setBusy(true); setMessage('');
      try { onAuthenticated(await loginWithGoogle(credential)); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Google sign-in failed.'); }
      finally { setBusy(false); }
    } });
    window.google.accounts.id.renderButton(googleButton.current, { theme: 'outline', size: 'large', width: 280 });
  }
  useEffect(() => { initializeGoogle(); }, [config, mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage('');
    try {
      if (mode === 'login') onAuthenticated(await login(email.trim(), String(form.get('password'))));
      else setMessage((await requestAccountEmail(email.trim(), mode === 'reset')).message);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Account request failed.'); }
    finally { setBusy(false); }
  }
  function switchMode(value: typeof mode) { setMode(value); setMessage(''); }
  return <main className="login-page"><section className="login-card"><div className="login-wordmark">Swift<span>Log</span></div><h1>{mode === 'login' ? 'Sign in' : mode === 'reset' ? 'Forgot password' : 'Verify your email'}</h1>{mode !== 'login' && <p>We’ll send a secure, single-use link to your account email.</p>}<form onSubmit={submit}><label className="field"><span>{mode === 'login' ? 'Email or account ID' : 'Email'}</span><input name="email" type={mode === 'login' ? 'text' : 'email'} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>{mode === 'login' && <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={72} required /></label>}{message && <div className="management-message" role="status">{message}</div>}<button className="button primary login-submit" disabled={busy || (mode !== 'login' && config?.emailEnabled === false)} type="submit">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Send email'}</button></form>{mode !== 'login' && config?.emailEnabled === false && <p role="status">Email delivery has not been configured. Contact your administrator.</p>}<div className="account-login-actions">{mode === 'login' ? config?.emailEnabled && <><button type="button" onClick={() => switchMode('reset')}>Forgot password?</button><button type="button" onClick={() => switchMode('verify')}>Send verification email</button></> : <button type="button" onClick={() => switchMode('login')}>Back to sign in</button>}</div>{mode === 'login' && (config?.googleClientId ? <><Script src="https://accounts.google.com/gsi/client" onReady={initializeGoogle} onError={() => setMessage('Google sign-in could not load. Try email and password.')} /><div ref={googleButton} className="google-sign-in" /></> : null)}</section></main>;
}
