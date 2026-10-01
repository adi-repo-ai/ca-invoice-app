import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { callFunction } from '../api';
import { SettingsTabs } from '../components/SettingsTabs';
import { useAuth } from '../auth';
import { Alert, Button, Card, Field, Loading, PageHeader, errorMessage } from '../components/ui';
import { db } from '../firebase';
import type { Role } from '../lib/types';

interface UserRow {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  disabled: boolean;
}

export default function Users() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ email: '', displayName: '', password: '', role: 'STAFF' as Role });

  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('email')));
    setRows(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserRow, 'uid'>) })));
  }, []);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: errorMessage(e) }));
  }, [load]);

  async function run(key: string, body: Record<string, unknown>, success: string) {
    setBusy(key);
    setMsg(null);
    try {
      await callFunction('admin-users', body);
      setMsg({ kind: 'success', text: success });
      await load();
      return true;
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
      return false;
    } finally {
      setBusy('');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (await run('create', { action: 'create', ...form }, `Created ${form.email}. Share the password with them securely.`)) {
      setForm({ email: '', displayName: '', password: '', role: 'STAFF' });
    }
  }

  async function setPassword(u: UserRow) {
    const password = window.prompt(`New password for ${u.email} (min 8 characters):`);
    if (password) await run(u.uid + 'pw', { action: 'setPassword', uid: u.uid, password }, `Password updated for ${u.email}.`);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <SettingsTabs />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card title="Add a user">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="Name">
            <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Initial password">
            <input type="text" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </Field>
          <Button type="submit" busy={busy === 'create'}>
            Create user
          </Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Role or status changes sign the user out of existing sessions; they take effect at their next sign-in.
        </p>
      </Card>
      <Card title="All users">
        {!rows ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((u) => {
              const self = u.uid === user?.uid;
              return (
                <li key={u.uid} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {u.displayName || u.email} {self && <span className="text-xs text-slate-500">(you)</span>}
                    </div>
                    <div className="text-sm text-slate-500">
                      {u.email} · {u.role} {u.disabled && <span className="font-medium text-red-600">· DISABLED</span>}
                    </div>
                  </div>
                  {!self && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        busy={busy === u.uid + 'role'}
                        onClick={() => {
                          const role = u.role === 'ADMIN' ? 'STAFF' : 'ADMIN';
                          if (window.confirm(`Change ${u.email} to ${role}?`)) run(u.uid + 'role', { action: 'setRole', uid: u.uid, role }, `${u.email} is now ${role}.`);
                        }}
                      >
                        Make {u.role === 'ADMIN' ? 'STAFF' : 'ADMIN'}
                      </Button>
                      <Button variant="secondary" busy={busy === u.uid + 'pw'} onClick={() => setPassword(u)}>
                        Set password
                      </Button>
                      <Button
                        variant={u.disabled ? 'secondary' : 'danger'}
                        busy={busy === u.uid + 'dis'}
                        onClick={() => {
                          const action = u.disabled ? 'enable' : 'disable';
                          if (window.confirm(`${action} ${u.email}?`)) run(u.uid + 'dis', { action, uid: u.uid }, `${u.email} ${action}d.`);
                        }}
                      >
                        {u.disabled ? 'Enable' : 'Disable'}
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
