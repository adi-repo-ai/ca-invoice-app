import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Button, Card, Field, Loading, PageHeader, errorMessage } from '../components/ui';
import { createClient, getClient, updateClient, type ClientInput } from '../data/clients';
import { db } from '../firebase';
import { CLIENT_TAGS } from '../lib/defaults';
import { INDIAN_STATES, STATES_BY_NAME } from '../lib/states';
import { isValidEmail, isValidGstin, isValidPan, normaliseWhatsapp } from '../lib/validation';
import { useSettings } from '../settings-context';

const EMPTY: ClientInput = {
  name: '',
  contactPerson: '',
  email: '',
  whatsapp: '',
  address: '',
  stateName: '',
  stateCode: '',
  gstin: '',
  pan: '',
  tags: [],
  notes: '',
};

export function validateClient(c: ClientInput, requireState = true): Partial<Record<keyof ClientInput, string>> {
  const e: Partial<Record<keyof ClientInput, string>> = {};
  if (!c.name.trim()) e.name = 'Required';
  if (requireState && !c.stateCode) e.stateCode = 'Required (decides CGST+SGST vs IGST)';
  if (c.email && !isValidEmail(c.email)) e.email = 'Invalid email';
  if (c.whatsapp && !normaliseWhatsapp(c.whatsapp)) e.whatsapp = 'Enter a 10-digit mobile number (or one with country code)';
  if (c.gstin) {
    if (!isValidGstin(c.gstin)) e.gstin = 'GSTIN must be 15 characters, e.g. 36ABCDE1234F1Z5';
    else if (c.stateCode && c.gstin.slice(0, 2) !== c.stateCode) e.gstin = `GSTIN starts with ${c.gstin.slice(0, 2)}, which doesn't match the selected state (${c.stateCode})`;
  }
  if (c.pan && !isValidPan(c.pan)) e.pan = 'PAN must look like ABCDE1234F';
  return e;
}

export default function ClientEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [c, setC] = useState<ClientInput | null>(id ? null : { ...EMPTY, stateCode: settings.stateCode, stateName: settings.stateName });
  const [errors, setErrors] = useState<ReturnType<typeof validateClient>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getClient(db, id)
      .then((row) => {
        if (!row) return setError('Client not found');
        const { id: _id, nameLower: _n, ...rest } = row;
        void _id;
        void _n;
        setC({ ...rest, tags: rest.tags ?? [], notes: rest.notes ?? '' });
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (!c) return error ? <Alert>{error}</Alert> : <Loading />;
  const set = (k: keyof ClientInput, v: string) => setC({ ...c, [k]: v });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean: ClientInput = {
      ...c!,
      name: c!.name.trim(),
      email: c!.email.trim(),
      whatsapp: c!.whatsapp ? (normaliseWhatsapp(c!.whatsapp) ?? c!.whatsapp) : '',
      tags: c!.tags ?? [],
      notes: (c!.notes ?? '').trim(),
    };
    const errs = validateClient(clean, settings.chargeGst);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError('');
    try {
      if (id) {
        await updateClient(db, user!.uid, id, clean);
        navigate(`/clients/${id}`);
      } else {
        const newId = await createClient(db, user!.uid, clean);
        navigate(`/clients/${newId}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PageHeader title={id ? 'Edit client' : 'New client'} />
      {error && <Alert>{error}</Alert>}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name *" error={errors.name}>
            <input value={c.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Contact person">
            <input value={c.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
          </Field>
          <Field label="Email" error={errors.email}>
            <input type="email" value={c.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Mobile number" error={errors.whatsapp} hint="10-digit mobile; +91 is added automatically. Used for WhatsApp.">
            <input type="tel" value={c.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
          </Field>
          <Field label="Billing address" className="sm:col-span-2">
            <textarea rows={3} value={c.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label={settings.chargeGst ? 'State *' : 'State'} error={errors.stateCode}>
            <select
              value={c.stateCode}
              onChange={(e) => {
                const st = INDIAN_STATES.find((s) => s.code === e.target.value);
                setC({ ...c, stateCode: st?.code ?? '', stateName: st?.name ?? '' });
              }}
            >
              <option value="">Select state…</option>
              {STATES_BY_NAME.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="GSTIN (optional)" error={errors.gstin}>
            <input value={c.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase().trim())} />
          </Field>
          <Field label="PAN (optional)" error={errors.pan}>
            <input value={c.pan} maxLength={10} onChange={(e) => set('pan', e.target.value.toUpperCase().trim())} />
          </Field>
        </div>
      </Card>
      <Card title="Tags & notes">
        <div className="mb-1 text-sm font-medium text-slate-700">Tags</div>
        <p className="mb-2 text-xs text-slate-500">Group clients by type and service; filter by these on the Clients page.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Client tags">
          {CLIENT_TAGS.map((t) => {
            const on = (c.tags ?? []).includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setC({ ...c, tags: on ? (c.tags ?? []).filter((x) => x !== t) : [...(c.tags ?? []), t] })}
                className={`rounded-full border px-3 py-1 text-sm transition ${on ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-slate-300 text-slate-700 hover:border-[var(--brand)] hover:text-[var(--brand)]'}`}
              >
                {on ? '✓ ' : ''}
                {t}
              </button>
            );
          })}
        </div>
        <Field label="Internal notes (never printed on invoices)" className="mt-4">
          <textarea rows={3} maxLength={2000} placeholder="e.g. Prefers WhatsApp. ITR filed every July. Accountant: Ramesh." value={c.notes ?? ''} onChange={(e) => setC({ ...c, notes: e.target.value })} />
        </Field>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          Save client
        </Button>
      </div>
    </form>
  );
}
