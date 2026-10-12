'use client';
import { AccountSecurity } from './account-security';

import { useEffect, useState } from 'react';
import { enableMyRiderAccess, getSession, type ApiError } from '../lib/api';

type Theme = 'light';
const themes: Array<{ id: Theme; name: string; note: string; colors: string[] }> = [
  { id: 'light', name: 'Swift Light', note: 'Bright neutral workspace', colors: ['#f8f9ff', '#16263b', '#f05a1a'] },
];

function Icon({ name }: { name: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined icon">{name}</span>;
}

export function SettingsPanel({ appearanceOnly = false }: { appearanceOnly?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminEmployeeCode, setAdminEmployeeCode] = useState('');
  const adminAlreadyRider = Boolean(getSession()?.user.riderId);

  useEffect(() => {
    setTheme('light');
    localStorage.setItem('swiftlog-theme', 'light');
    document.documentElement.dataset.theme = 'light';
  }, []);

  function chooseTheme(value: Theme) {
    setTheme(value);
    localStorage.setItem('swiftlog-theme', value);
    document.documentElement.dataset.theme = value;
  }

  async function enableAdminRider() {
    setBusy(true);
    setMessage('');
    try {
      await enableMyRiderAccess(adminEmployeeCode);
      setMessage('Rider access enabled. Sign in again to refresh your session.');
    } catch (error) {
      setMessage((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content settings-page">
    <div className="page-header"><div><span className="eyebrow">SETTINGS</span><h2>Settings</h2><p>Personalize this device and manage your rider access.</p></div></div>
    <section className="settings-section">
      <header><Icon name="palette" /><div><h3>Appearance</h3><p>Theme is saved on this browser.</p></div></header>
      <div className="theme-options">{themes.map((item) => <button className={theme === item.id ? 'active' : ''} key={item.id} onClick={() => chooseTheme(item.id)} type="button"><span className="theme-swatches">{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><strong>{item.name}</strong><small>{item.note}</small>{theme === item.id && <Icon name="check_circle" />}</button>)}</div>
    </section>
    <AccountSecurity />
    {!appearanceOnly && getSession()?.user.roles.includes('ADMIN') && <section className="settings-section">
      <header><Icon name="two_wheeler" /><div><h3>Admin rider access</h3><p>An administrator may also receive rider assignments.</p></div></header>
      {adminAlreadyRider ? <div className="success-callout">Your admin account already has rider access.</div> : <div className="compact-form-grid"><label className="field"><span>Rider employee code</span><input value={adminEmployeeCode} onChange={(event) => setAdminEmployeeCode(event.target.value)} /></label><div className="editor-actions"><button className="button primary" disabled={busy || adminEmployeeCode.trim().length < 2} onClick={() => void enableAdminRider()} type="button">{busy ? 'Saving…' : 'Enable rider access'}</button></div></div>}
      {message && <div className="management-message">{message}</div>}
    </section>}
  </div>;
}
