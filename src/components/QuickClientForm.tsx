import { useState } from 'react';
import { useAuth } from '../auth';
import { createClient, type ClientInput, type ClientRow } from '../data/clients';
import { db } from '../firebase';
import { INDIAN_STATES } from '../lib/states';
import { normaliseWhatsapp } from '../lib/validation';
import { validateClient } from '../pages/ClientEdit';
import { useSettings } from '../settings-context';
import { Alert, Button, Field, errorMessage } from './ui';

/** Minimal "add a client" form used inside the invoice screen. */
export function QuickClientForm({ onCreated, onCancel }: { onCreated: (c: ClientRow) => void; onCancel: () => void }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [c, setC] = useState<ClientInput>({
    name: '',
    contactPerson: '',
    email: '',
    whatsapp: '',
    address: '',
    stateName: settings.stateName,
    stateCode: settings.stateCode,
    gstin: '',
    pan: '',
  });
  const [errors, setErrors] = useState<ReturnType<typeof validateClient>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ClientInput, v: string) => setC({ ...c, [k]: v });

  async function save() {
    const clean = { ...c, name: c.name.trim(), email: c.email.trim(), whatsapp: c.whatsapp ? (normaliseWhatsapp(c.whatsapp) ?? c.whatsapp) : '' };
    const errs = validateClient(clean);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      const id = await createClient(db, user!.uid, clean);
      onCreated({ id, ...clean, nameLower: clean.name.toLowerCase() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client name *" error={errors.name}>
          <input autoFocus value={c.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="State *" error={errors.stateCode}>
          <select
            value={c.stateCode}
            onChange={(e) => {
              const st = INDIAN_STATES.find((s) => s.code === e.target.value);
              setC({ ...c, stateCode: st?.code ?? '', stateName: st?.name ?? '' });
            }}
          >
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email" error={errors.email}>
          <input type="email" value={c.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="WhatsApp number" error={errors.whatsapp}>
          <input type="tel" value={c.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <textarea rows={2} value={c.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="GSTIN (optional)" error={errors.gstin}>
          <input value={c.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase().trim())} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" busy={busy} onClick={save}>
          Save client
        </Button>
      </div>
    </div>
  );
}
