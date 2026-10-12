'use client';
import { useState } from 'react';
import { changeAccountPassword, requestAccountEmail, updateShopUser, type ShopUserOption } from '../lib/api';

export function AccountSecurity() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== form.get('confirm')) { setMessage('Passwords do not match.'); return; }
    setBusy(true); setMessage('');
    try { setMessage((await changeAccountPassword(String(form.get('currentPassword')), password)).message); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Password could not be changed.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-section"><header><div><h3>Account password</h3><p>Changing your password signs out existing sessions.</p></div></header><form onSubmit={submit} className="compact-form-grid"><label className="field"><span>Current password</span><input type="password" name="currentPassword" autoComplete="current-password" required maxLength={72} /></label><label className="field"><span>New password</span><input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label><label className="field"><span>Confirm new password</span><input type="password" name="confirm" autoComplete="new-password" minLength={12} maxLength={72} required /></label><button className="button primary" disabled={busy} type="submit">Change password</button>{message && <p role="status">{message}</p>}</form></section>;
}

const choices = [{ code: 'shipment:create', label: 'Create shipments' }, { code: 'shipment:view', label: 'View shipments and history' }, { code: 'documents:view', label: 'View and download PDFs' }, { code: 'documents:create', label: 'Upload documents' }];
export function ShopAccessEditor({ shopId, user, onSaved }: { shopId: string; user: ShopUserOption; onSaved: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement);
    setBusy(true); setMessage('');
    try {
      const permissions = form.getAll('permissions').map(String);
      if (permissions.includes('shipment:create') || permissions.includes('shipment:view')) permissions.push('customer:view');
      await updateShopUser(shopId, user.id, { isActive: form.get('active') === 'on', permissions, ...(form.get('password') ? { password: String(form.get('password')) } : {}) });
      const passwordInput = formElement.elements.namedItem('password') as HTMLInputElement; passwordInput.value = '';
      setMessage('Saved. Previous sessions have been signed out.'); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Access could not be updated.'); }
    finally { setBusy(false); }
  }
  async function email(reset: boolean) {
    setBusy(true); setMessage('');
    try { setMessage((await requestAccountEmail(user.email, reset)).message); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Email could not be sent.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="shop-account-editor"><header><strong>{user.displayName}</strong><small>{user.email}</small><small>{user.emailVerifiedAt ? 'Email verified' : 'Email verification required'} · {user.isActive ? 'Enabled' : 'Disabled'}</small></header><label><input name="active" type="checkbox" defaultChecked={user.isActive} /> Enable account</label>{choices.map((choice) => <label key={choice.code}><input name="permissions" value={choice.code} type="checkbox" defaultChecked={user.shopPermissions?.includes(choice.code) ?? true} /> {choice.label}</label>)}<label className="field"><span>Set new password (optional)</span><input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" placeholder="Leave blank to keep password" /></label><div className="editor-actions"><button disabled={busy} className="button primary" type="submit">Save access</button><button disabled={busy || !user.isActive} className="button subtle" onClick={() => void email(true)} type="button">Send password reset</button>{!user.emailVerifiedAt && <button disabled={busy || !user.isActive} className="button subtle" onClick={() => void email(false)} type="button">Send verification</button>}</div>{message && <p role="status">{message}</p>}</form>;
}
