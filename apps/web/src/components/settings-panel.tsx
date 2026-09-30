'use client';
import { useEffect, useMemo, useState } from 'react';
import { enableMyRiderAccess, getSession, getStaff, getStaffAccessOptions, updateStaffAccess, type AccessOption, type ApiError, type StaffOption } from '../lib/api';

type Theme = 'light' | 'midnight' | 'cobalt';
const themes: Array<{ id: Theme; name: string; note: string; colors: string[] }> = [
  { id: 'light', name: 'Swift Light', note: 'Bright neutral workspace', colors: ['#f8f9ff','#16263b','#f05a1a'] },
  { id: 'midnight', name: 'Midnight', note: 'Low-light operations', colors: ['#0b1220','#e7edf7','#ff6b2c'] },
  { id: 'cobalt', name: 'Cobalt', note: 'Cool blue control room', colors: ['#eef5ff','#102a56','#2563eb'] },
];
function Icon({ name }: { name: string }) { return <span aria-hidden="true" className="material-symbols-outlined icon">{name}</span>; }

export function SettingsPanel({ appearanceOnly = false }: { appearanceOnly?: boolean }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [options, setOptions] = useState<AccessOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [riderEnabled, setRiderEnabled] = useState(false);
  const [employeeCode, setEmployeeCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminEmployeeCode, setAdminEmployeeCode] = useState('');
  const adminAlreadyRider = Boolean(getSession()?.user.riderId);
  const selected = useMemo(() => staff.find((item) => item.id === selectedId), [staff, selectedId]);
  useEffect(() => { const saved = (localStorage.getItem('swiftlog-theme') as Theme | null) ?? 'light'; setTheme(saved); document.documentElement.dataset.theme = saved; if (!appearanceOnly) void Promise.all([getStaff(), getStaffAccessOptions()]).then(([people, access]) => { setStaff(people); setOptions(access); }).catch((error: ApiError) => setMessage(error.message)); }, [appearanceOnly]);
  useEffect(() => { setSelectedPermissions(selected?.permissions ?? []); setRiderEnabled(Boolean(selected?.riderEnabled)); setEmployeeCode(selected?.rider?.employeeCode ?? ''); setMessage(''); }, [selected]);
  function chooseTheme(value: Theme) { setTheme(value); localStorage.setItem('swiftlog-theme', value); document.documentElement.dataset.theme = value; }
  function togglePermission(code: string) { setSelectedPermissions((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]); }
  async function saveAccess() { if (!selected) return; setBusy(true); setMessage(''); try { await updateStaffAccess(selected.id, { permissions: selectedPermissions, riderEnabled, employeeCode: riderEnabled ? employeeCode : undefined }); setMessage('Access saved. This staff member must sign in again.'); setStaff(await getStaff()); } catch (error) { setMessage((error as ApiError).message); } finally { setBusy(false); } }
  async function enableAdminRider() { setBusy(true); setMessage(''); try { await enableMyRiderAccess(adminEmployeeCode); setMessage('Rider access enabled for your admin account. Sign in again to refresh access.'); } catch (error) { setMessage((error as ApiError).message); } finally { setBusy(false); } }
  const groups = useMemo(() => options.reduce<Record<string, AccessOption[]>>((result, option) => { const group = option.code.split(':')[0]; (result[group] ??= []).push(option); return result; }, {}), [options]);
  return <div className="page-content settings-page"><div className="page-header"><div><span className="eyebrow">ADMIN / SETTINGS</span><h2>Settings</h2><p>Personalize this device and control individual staff access.</p></div></div>
    <section className="settings-section"><header><Icon name="palette" /><div><h3>Appearance</h3><p>Theme is saved on this browser.</p></div></header><div className="theme-options">{themes.map((item) => <button className={theme === item.id ? 'active' : ''} key={item.id} onClick={() => chooseTheme(item.id)} type="button"><span className="theme-swatches">{item.colors.map((color) => <i key={color} style={{ background: color }} />)}</span><strong>{item.name}</strong><small>{item.note}</small>{theme === item.id && <Icon name="check_circle" />}</button>)}</div></section>
    {!appearanceOnly && <section className="settings-section"><header><Icon name="two_wheeler" /><div><h3>Admin rider access</h3><p>The administrator can also receive rider assignments.</p></div></header>{adminAlreadyRider ? <div className="success-callout">Your admin account already has rider access.</div> : <div className="compact-form-grid"><label className="field"><span>Rider employee code</span><input value={adminEmployeeCode} onChange={(event) => setAdminEmployeeCode(event.target.value)} /></label><div className="editor-actions"><button className="button primary" disabled={busy || adminEmployeeCode.trim().length < 2} onClick={() => void enableAdminRider()} type="button">Enable rider access</button></div></div>}</section>}
    {!appearanceOnly && <section className="settings-section"><header><Icon name="admin_panel_settings" /><div><h3>Staff access</h3><p>Permissions are individual. ADMIN access is never changed here.</p></div></header>{!staff.length ? <div className="settings-empty">Create a staff account in Management before assigning access.</div> : <div className="access-layout"><aside>{staff.map((person) => <button className={selectedId === person.id ? 'active' : ''} key={person.id} onClick={() => setSelectedId(person.id)} type="button"><span><strong>{person.displayName}</strong><small>{person.email}</small></span><Icon name="chevron_right" /></button>)}</aside>{selected ? <div className="access-editor"><div className="access-person"><div className="avatar">{selected.displayName.slice(0,2).toUpperCase()}</div><div><strong>{selected.displayName}</strong><small>{selectedPermissions.length} permissions selected</small></div></div><label className="rider-access"><input checked={riderEnabled} onChange={(event) => setRiderEnabled(event.target.checked)} type="checkbox" /><span><strong>Also works as a rider</strong><small>Allows this person to receive assigned pickups and deliveries.</small></span></label>{riderEnabled && <label className="field"><span>Rider employee code</span><input value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} required /></label>}<div className="permission-groups">{Object.entries(groups).map(([group, entries]) => <fieldset key={group}><legend>{group.replaceAll('_',' ')}</legend>{entries.map((option) => <label key={option.code}><input checked={selectedPermissions.includes(option.code)} onChange={() => togglePermission(option.code)} type="checkbox" /><span><strong>{option.code.split(':')[1]?.replaceAll('_',' ')}</strong><small>{option.description || option.code}</small></span></label>)}</fieldset>)}</div><div className="editor-actions"><button className="button primary" disabled={busy || (riderEnabled && !employeeCode.trim())} onClick={() => void saveAccess()} type="button">{busy ? 'Saving…' : 'Save access'}</button></div></div> : <div className="settings-empty">Select a staff member to configure access.</div>}</div>}{message && <div className="management-message">{message}</div>}</section>}
  </div>;
}
