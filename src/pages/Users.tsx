import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callFunction } from '../api';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { SettingsTabs } from '../components/SettingsTabs';
import { Alert, Button, Card, Empty, Field, Loading, PageHeader, Stat, Switch, errorMessage } from '../components/ui';
import { db } from '../firebase';
import type { Role } from '../lib/types';
import { isValidEmail } from '../lib/validation';

interface UserRow {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  lastSeenAt?: Timestamp;
  fin?: boolean; // can see revenue (missing on older records: ADMIN = yes)
  pay?: boolean; // can record payments / receipts / statements (missing = yes)
}

/** Effective permissions, matching the server's defaults for older records. */
function permsOf(u: UserRow): { fin: boolean; pay: boolean } {
  return { fin: u.fin ?? u.role === 'ADMIN', pay: u.pay ?? true };
}

/** Plain-language access level shown next to each person. */
function accessLabel(u: UserRow): { text: string; cls: string } {
  const p = permsOf(u);
  if (u.role === 'ADMIN' && p.fin) return { text: 'Owner · full access', cls: 'bg-[var(--brand)] text-white' };
  if (u.role === 'ADMIN') return { text: p.pay ? 'Admin · no revenue' : 'Admin · no revenue, no payments', cls: 'bg-blue-100 text-blue-800' };
  return { text: p.pay ? 'Staff · with payments' : 'Staff', cls: 'bg-slate-100 text-slate-700' };
}
interface InviteRow {
  email: string;
  role: Role;
}

const ACTIVE_WINDOW_MS = 10 * 60 * 1000; // "Active now" = seen in the last 10 minutes

function lastSeen(u: UserRow): { active: boolean; text: string } {
  if (u.disabled) return { active: false, text: 'Disabled' };
  const t = u.lastSeenAt?.toDate();
  if (!t) return { active: false, text: 'Not signed in yet' };
  const ago = Date.now() - t.getTime();
  if (ago < ACTIVE_WINDOW_MS) return { active: true, text: 'Active now' };
  const mins = Math.round(ago / 60000);
  const text =
    mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return { active: false, text: `Last active ${text}` };
}

export default function Users() {
  const { user, role: myRole, fin: myFin } = useAuth();
  const iAmOwner = myRole === 'ADMIN' && myFin;
  const dialog = useDialog();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ email: '', role: 'STAFF' as Role });

  const load = useCallback(async () => {
    const [u, i] = await Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'invites'))]);
    setRows(u.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserRow, 'uid'>) })).sort((a, b) => a.email.localeCompare(b.email)));
    setInvites(i.docs.map((d) => d.data() as InviteRow).sort((a, b) => a.email.localeCompare(b.email)));
  }, []);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: errorMessage(e) }));
    const t = setInterval(() => load().catch(() => undefined), 60_000); // keep "Active now" fresh
    return () => clearInterval(t);
  }, [load]);

  async function run(key: string, body: Record<string, unknown>, success: string) {
    setBusy(key);
    setMsg(null);
    try {
      await callFunction('admin-users', body);
      setMsg({ kind: 'success', text: success });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!isValidEmail(email)) return setMsg({ kind: 'error', text: 'Enter a valid email address.' });
    if (rows?.some((r) => r.email.toLowerCase() === email)) return setMsg({ kind: 'error', text: `${email} already has access.` });
    setBusy('invite');
    setMsg(null);
    try {
      await setDoc(doc(db, 'invites', email), { email, role: form.role, invitedBy: user!.uid, invitedAt: serverTimestamp() });
      setForm({ email: '', role: 'STAFF' });
      setMsg({ kind: 'success', text: `${email} can now sign in with Google (as ${form.role}).` });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy('');
    }
  }

  const activeCount = rows?.filter((r) => lastSeen(r).active).length ?? 0;
  const enabledCount = rows?.filter((r) => !r.disabled).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Who can sign in to the portal" />
      <SettingsTabs />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Users with access" value={enabledCount} />
        <Stat label="Active now" value={activeCount} tone={activeCount ? 'good' : 'default'} hint="Seen in the last 10 minutes" />
        <Stat label="Waiting to sign in" value={invites.length} />
      </div>

      <Card title="Give someone access">
        <form onSubmit={invite} className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <Field label="Google email address" hint="They sign in with this Google account (e.g. name@gmail.com).">
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role" hint="New ADMINs start without revenue or payments access; STAFF start with payments. An owner can change this once they have joined.">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </Field>
          <Button type="submit" busy={busy === 'invite'} className="sm:mb-6">
            Give access
          </Button>
        </form>
      </Card>

      {invites.length > 0 && (
        <Card title="Waiting to sign in for the first time">
          <ul className="divide-y divide-slate-100">
            {invites.map((i) => (
              <li key={i.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium">{i.email}</div>
                  <div className="text-sm text-slate-500">{i.role} · invited</div>
                </div>
                <Button
                  variant="ghost"
                  className="!text-red-600"
                  onClick={async () => {
                    if (!(await dialog.confirm({ title: `Remove access for ${i.email}?`, confirmText: 'Remove', danger: true }))) return;
                    await deleteDoc(doc(db, 'invites', i.email)).catch((e) => setMsg({ kind: 'error', text: errorMessage(e) }));
                    await load();
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="People with access">
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((u) => {
              const self = u.uid === user?.uid;
              const seen = lastSeen(u);
              return (
                <li key={u.uid} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 font-semibold text-[var(--brand)]">
                      {(u.displayName || u.email).charAt(0).toUpperCase()}
                      <span
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--color-surface)] ${seen.active ? 'bg-green-500' : u.disabled ? 'bg-red-500' : 'bg-slate-300'}`}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{u.displayName || u.email}</span> {self && <span className="text-xs text-slate-500">(you)</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${accessLabel(u).cls}`}>{accessLabel(u).text}</span>
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {u.email} · <span className={seen.active ? 'font-medium text-green-700' : u.disabled ? 'text-red-700' : ''}>{seen.text}</span>
                      </div>
                    </div>
                  </div>
                  {!self && iAmOwner && (
                    <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-slate-50 px-3 py-2 text-sm sm:order-last">
                      {u.role === 'ADMIN' && (
                        <label className="flex items-center gap-2">
                          <Switch
                            checked={permsOf(u).fin}
                            label={`Revenue & reports for ${u.email}`}
                            onChange={async (v) => {
                              if (v && !(await dialog.confirm({ title: `Give ${u.email} revenue access?`, message: 'They will see revenue totals, reports, CSV export and backup, and become an owner who can change other people\'s access.', confirmText: 'Give access' })))
                                return;
                              run(u.uid + 'perm', { action: 'setPerms', uid: u.uid, fin: v, pay: permsOf(u).pay }, `${u.email}: revenue access ${v ? 'on' : 'off'}. They will be asked to sign in again.`);
                            }}
                          />
                          Revenue &amp; reports
                        </label>
                      )}
                      <label className="flex items-center gap-2">
                        <Switch
                          checked={permsOf(u).pay}
                          label={`Payments, receipts & statements for ${u.email}`}
                          onChange={(v) =>
                            run(u.uid + 'perm', { action: 'setPerms', uid: u.uid, fin: permsOf(u).fin, pay: v }, `${u.email}: payments, receipts & statements ${v ? 'on' : 'off'}. They will be asked to sign in again.`)
                          }
                        />
                        Payments, receipts &amp; statements
                      </label>
                      {busy === u.uid + 'perm' && <span className="text-xs text-slate-500">Saving…</span>}
                    </div>
                  )}
                  {!self && (iAmOwner || !(u.role === 'ADMIN' && permsOf(u).fin)) && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        busy={busy === u.uid + 'role'}
                        onClick={async () => {
                          const role = u.role === 'ADMIN' ? 'STAFF' : 'ADMIN';
                          if (await dialog.confirm({ title: `Make ${u.email} ${role}?`, message: 'They will be signed out and get the new role at next sign-in.', confirmText: `Make ${role}` }))
                            run(u.uid + 'role', { action: 'setRole', uid: u.uid, role }, `${u.email} is now ${role}.`);
                        }}
                      >
                        Make {u.role === 'ADMIN' ? 'STAFF' : 'ADMIN'}
                      </Button>
                      <Button
                        variant={u.disabled ? 'secondary' : 'danger'}
                        busy={busy === u.uid + 'dis'}
                        onClick={async () => {
                          const action = u.disabled ? 'enable' : 'disable';
                          if (
                            await dialog.confirm({
                              title: `${u.disabled ? 'Enable' : 'Disable'} ${u.email}?`,
                              message: u.disabled ? 'They will be able to sign in again.' : 'They will be signed out and cannot sign in until enabled again.',
                              confirmText: u.disabled ? 'Enable' : 'Disable',
                              danger: !u.disabled,
                            })
                          )
                            run(u.uid + 'dis', { action, uid: u.uid }, `${u.email} ${action}d.`);
                        }}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
                      </Button>
                      <Button
                        variant="ghost"
                        className="!text-red-600"
                        busy={busy === u.uid + 'del'}
                        onClick={async () => {
                          const typed = await dialog.prompt({
                            title: `Delete ${u.email}?`,
                            message:
                              'Their sign-in account and access are removed permanently, along with their private tasks, events, notes and links. Invoices they created are kept. To give them access again, add their email above. Type DELETE to confirm.',
                            label: 'Type DELETE',
                            confirmText: 'Delete user',
                            danger: true,
                          });
                          if (typed === null) return;
                          if (typed.trim().toUpperCase() !== 'DELETE') return setMsg({ kind: 'error', text: 'Not deleted: you must type DELETE to confirm.' });
                          run(u.uid + 'del', { action: 'delete', uid: u.uid }, `${u.email} deleted.`);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
