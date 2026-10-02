import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { callFunction } from '../api';
import { useDialog } from '../components/Dialog';
import { SettingsTabs } from '../components/SettingsTabs';
import { useAuth } from '../auth';
import { Alert, Button, Card, Field, PageHeader, Switch, errorMessage } from '../components/ui';
import { saveSettings } from '../data/settings';
import { db } from '../firebase';
import { formatInvoiceNumber, fyForDate, todayIST } from '../lib/fy';
import { DEFAULT_SETTINGS } from '../lib/defaults';
import { resizeLogo } from '../lib/image';
import { paiseToInput, parseRupeesToPaise } from '../lib/money';
import { INDIAN_STATES, STATES_BY_NAME } from '../lib/states';
import type { FirmSettings } from '../lib/types';
import { HEX_COLOR_RE, IFSC_RE, SAC_RE, isValidEmail, isValidGstin, isValidPan } from '../lib/validation';
import { useSettings } from '../settings-context';

type Errors = Partial<Record<string, string>>;

/** Shows this year's last invoice number and lets an ADMIN restart at 0001 once no numbered invoice is left. */
function NumberingCard({ prefix }: { prefix: string }) {
  const dialog = useDialog();
  const fy = fyForDate(todayIST());
  const [last, setLast] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = () =>
    getDoc(doc(db, 'counters', fy))
      .then((d) => setLast(d.exists() ? (d.data().last as number) : 0))
      .catch(() => setLast(null));
  useEffect(() => {
    load();
  }, [fy]);

  async function reset() {
    const ok = await dialog.confirm({
      title: 'Restart numbering at 0001?',
      message: `The next invoice will be ${formatInvoiceNumber(prefix, fy, 1)}. This only works once every numbered invoice from FY ${fy} has been deleted (drafts are fine), so numbers are never duplicated.`,
      confirmText: 'Restart at 0001',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      await callFunction('reset-numbering', {});
      setMsg({ kind: 'success', text: `Numbering restarted. The next invoice will be ${formatInvoiceNumber(prefix, fy, 1)}.` });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Invoice numbering">
      {msg && (
        <div className="mb-3">
          <Alert kind={msg.kind}>{msg.text}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div>
            Financial year <span className="font-semibold">{fy}</span>
          </div>
          <div className="text-slate-600">
            {last === undefined
              ? 'Loading…'
              : last === null
                ? 'Could not read the current number.'
                : last === 0
                  ? `No invoice issued yet. The next one will be ${formatInvoiceNumber(prefix, fy, 1)}.`
                  : `Last issued: ${formatInvoiceNumber(prefix, fy, last)}. Next: ${formatInvoiceNumber(prefix, fy, last + 1)}.`}
          </div>
          <p className="mt-1 text-xs text-slate-500">Use this after deleting test invoices, so your real invoices start from 0001.</p>
        </div>
        <Button type="button" variant="secondary" className="!border-red-300 !text-red-600" busy={busy} disabled={!last} onClick={reset}>
          Restart at 0001
        </Button>
      </div>
    </Card>
  );
}

function validate(s: FirmSettings, gstRate: string): Errors {
  const e: Errors = {};
  if (!s.name.trim()) e.name = 'Required';
  if (s.gstin && !isValidGstin(s.gstin)) e.gstin = 'Invalid GSTIN format (15 characters)';
  if (s.gstin && isValidGstin(s.gstin) && s.gstin.slice(0, 2) !== s.stateCode) e.gstin = 'GSTIN state code does not match the firm state';
  if (s.pan && !isValidPan(s.pan)) e.pan = 'Invalid PAN format';
  if (s.email && !isValidEmail(s.email)) e.email = 'Invalid email';
  if (s.bank.ifsc && !IFSC_RE.test(s.bank.ifsc)) e.ifsc = 'Invalid IFSC';
  if (!HEX_COLOR_RE.test(s.brandColor)) e.brandColor = 'Use #RRGGBB';
  if (s.chargeGst && (!/^\d{1,2}(\.\d{1,2})?$/.test(gstRate) || Number(gstRate) > 28)) e.gstRate = 'Enter a rate between 0 and 28';
  if (!/^[A-Z]{1,3}$/.test(s.invoicePrefix)) e.invoicePrefix = '1–3 capital letters';
  if (!Number.isInteger(s.paymentDueDays) || s.paymentDueDays < 0 || s.paymentDueDays > 365) e.paymentDueDays = '0–365';
  s.sacCodes.forEach((c, i) => {
    if (!SAC_RE.test(c.code)) e[`sac${i}`] = 'SAC must be 4–8 digits';
  });
  return e;
}

export default function Settings() {
  const { user } = useAuth();
  const { settings, saved, reload } = useSettings();
  const [s, setS] = useState<FirmSettings>(settings);
  const [gstRate, setGstRate] = useState(String(settings.gstRateBp / 100));
  const [goal, setGoal] = useState(settings.monthlyGoalPaise ? paiseToInput(settings.monthlyGoalPaise) : '');
  // Default service prices as typed (rupees); converted to paise on save.
  const [rates, setRates] = useState<string[]>(settings.sacCodes.map((c) => (c.ratePaise ? paiseToInput(c.ratePaise) : '')));
  const [errors, setErrors] = useState<Errors>({});
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setS(settings);
    setGstRate(String(settings.gstRateBp / 100));
    setGoal(settings.monthlyGoalPaise ? paiseToInput(settings.monthlyGoalPaise) : '');
    setRates(settings.sacCodes.map((c) => (c.ratePaise ? paiseToInput(c.ratePaise) : '')));
  }, [settings]);

  const set = <K extends keyof FirmSettings>(k: K, v: FirmSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  const setBank = (k: keyof FirmSettings['bank'], v: string) => setS((p) => ({ ...p, bank: { ...p.bank, [k]: v } }));

  async function onSignature(file: File | undefined) {
    if (!file) return;
    try {
      set('signatureDataUrl', await resizeLogo(file));
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    try {
      set('logoDataUrl', await resizeLogo(file));
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validate(s, gstRate);
    rates.forEach((r, i) => {
      if (r.trim() && (parseRupeesToPaise(r) ?? -1) < 0) errs[`rate${i}`] = 'Enter a valid price or leave blank';
    });
    const monthlyGoalPaise = goal.trim() ? parseRupeesToPaise(goal) : 0;
    if (monthlyGoalPaise === null || monthlyGoalPaise < 0) errs.goal = 'Enter an amount in rupees, or leave blank';
    setErrors(errs);
    if (Object.keys(errs).length) return setMsg({ kind: 'error', text: 'Please fix the highlighted fields.' });
    setBusy(true);
    setMsg(null);
    try {
      const [whole, frac = ''] = gstRate.split('.');
      const gstRateBp = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
      const sacCodes = s.sacCodes.map((c, i) => {
        const ratePaise = rates[i]?.trim() ? parseRupeesToPaise(rates[i]) : null;
        return ratePaise ? { code: c.code, description: c.description.trim(), ratePaise } : { code: c.code, description: c.description.trim() };
      });
      await saveSettings(db, user!.uid, { ...s, sacCodes, gstRateBp, monthlyGoalPaise: monthlyGoalPaise ?? 0, name: s.name.trim() });
      await reload();
      setMsg({ kind: 'success', text: 'Settings saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const text = (k: 'name' | 'tagline' | 'proprietor' | 'phone' | 'email' | 'website', label: string) => (
    <Field label={label} error={errors[k]}>
      <input value={s[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      <PageHeader title="Settings" actions={<Button type="submit" busy={busy}>Save settings</Button>} />
      <SettingsTabs />
      {!saved && <Alert kind="info">These are the starting details from your visiting card. Add your GSTIN, PAN and bank / UPI details, check everything, then click Save settings (needed once before creating invoices). You can change any of it later.</Alert>}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title="Firm details">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('name', 'Firm name')}
          {text('tagline', 'Tagline (optional, e.g. Chartered Accountants)')}
          {text('proprietor', 'Proprietor / partner line (optional, e.g. CA Lingeshwar, ACA)')}
          {text('phone', 'Phone')}
          {text('email', 'Email')}
          {text('website', 'Website')}
          <Field label="Address" className="sm:col-span-2">
            <textarea rows={3} value={s.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="State (for GST)" hint="Clients in this state are charged CGST + SGST; others IGST.">
            <select
              value={s.stateCode}
              onChange={(e) => {
                const st = INDIAN_STATES.find((x) => x.code === e.target.value)!;
                setS((p) => ({ ...p, stateCode: st.code, stateName: st.name }));
              }}
            >
              {STATES_BY_NAME.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="GSTIN" error={errors.gstin}>
            <input value={s.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase().trim())} />
          </Field>
          <Field label="PAN" error={errors.pan}>
            <input value={s.pan} maxLength={10} onChange={(e) => set('pan', e.target.value.toUpperCase().trim())} />
          </Field>
        </div>
      </Card>

      <Card title="Bank & UPI details (printed on invoices)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account name">
            <input value={s.bank.accountName} onChange={(e) => setBank('accountName', e.target.value)} />
          </Field>
          <Field label="Account number">
            <input value={s.bank.accountNumber} inputMode="numeric" onChange={(e) => setBank('accountNumber', e.target.value.trim())} />
          </Field>
          <Field label="IFSC" error={errors.ifsc}>
            <input value={s.bank.ifsc} maxLength={11} onChange={(e) => setBank('ifsc', e.target.value.toUpperCase().trim())} />
          </Field>
          <Field label="Branch">
            <input value={s.bank.branch} onChange={(e) => setBank('branch', e.target.value)} />
          </Field>
          <Field label="UPI ID" hint="Printed as a 'Scan to pay' QR code on unpaid invoices.">
            <input value={s.bank.upiId} onChange={(e) => setBank('upiId', e.target.value.trim())} />
          </Field>
        </div>
      </Card>

      <Card title="Invoicing">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="max-w-xl">
            <div className="font-medium">Charge GST on invoices</div>
            <p className="text-sm text-slate-600">
              {s.chargeGst
                ? 'ON: GST is added to every invoice (shown as one "GST @ rate" line on the PDF).'
                : 'OFF: invoices have no GST. Turn this on only if the firm is GST-registered and charges GST.'}
            </p>
          </div>
          <Switch checked={s.chargeGst} onChange={(v) => set('chargeGst', v)} label="Charge GST" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {s.chargeGst && (
            <Field label="GST rate (%)" error={errors.gstRate} hint="Split equally into CGST + SGST for intra-state.">
              <input value={gstRate} inputMode="decimal" onChange={(e) => setGstRate(e.target.value.trim())} />
            </Field>
          )}
          <Field
            label="Invoice number prefix"
            error={errors.invoicePrefix}
            hint={/^[A-Z]{1,3}$/.test(s.invoicePrefix) ? `e.g. ${formatInvoiceNumber(s.invoicePrefix, fyForDate(todayIST()), 1)}` : undefined}
          >
            <input value={s.invoicePrefix} maxLength={3} onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase().trim())} />
          </Field>
          <Field label="Payment due (days)" error={errors.paymentDueDays} hint="Used to flag overdue invoices.">
            <input type="number" min={0} max={365} value={s.paymentDueDays} onChange={(e) => set('paymentDueDays', Number(e.target.value))} />
          </Field>
          <Field label="Default terms" className="sm:col-span-3">
            <textarea rows={4} value={s.defaultTerms} onChange={(e) => set('defaultTerms', e.target.value)} />
          </Field>
        </div>
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-700">Services you bill</h3>
          <p className="mb-2 text-xs text-slate-500">
            Choosing a service on an invoice fills in its description, SAC code and default price (price is optional and can be changed per invoice).
          </p>
          <div className="space-y-3">
            {s.sacCodes.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-12 sm:items-start sm:border-0 sm:p-0">
                <input
                  className="col-span-2 min-w-0 sm:col-span-6"
                  placeholder="Service (e.g. Income tax return filing)"
                  value={c.description}
                  onChange={(e) => set('sacCodes', s.sacCodes.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                />
                <div className="sm:col-span-2">
                  <input
                    className="w-full"
                    placeholder="SAC"
                    inputMode="numeric"
                    value={c.code}
                    onChange={(e) => set('sacCodes', s.sacCodes.map((x, j) => (j === i ? { ...x, code: e.target.value.trim() } : x)))}
                  />
                  {errors[`sac${i}`] && <p className="text-xs text-red-600">{errors[`sac${i}`]}</p>}
                </div>
                <div className="sm:col-span-2">
                  <input
                    className="w-full"
                    placeholder="Price ₹ (optional)"
                    inputMode="decimal"
                    value={rates[i] ?? ''}
                    onChange={(e) => setRates(s.sacCodes.map((_, j) => (j === i ? e.target.value : (rates[j] ?? ''))))}
                  />
                  {errors[`rate${i}`] && <p className="text-xs text-red-600">{errors[`rate${i}`]}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="col-span-2 sm:col-span-2"
                  onClick={() => {
                    set('sacCodes', s.sacCodes.filter((_, j) => j !== i));
                    setRates(rates.filter((_, j) => j !== i));
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                set('sacCodes', [...s.sacCodes, { code: '', description: '' }]);
                setRates([...rates, '']);
              }}
            >
              Add service
            </Button>
          </div>
        </div>
      </Card>

      <NumberingCard prefix={s.invoicePrefix} />

      <Card title="Goals & messages">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly collection goal (₹)" error={errors.goal} hint="Shown as a progress ring on Home. Leave blank to hide.">
            <input inputMode="decimal" placeholder="e.g. 200000" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-700">WhatsApp / email messages</h3>
          <p className="mb-3 text-xs text-slate-500">
            Used when sending invoices, reminders and receipts. Placeholders: {'{client} {number} {date} {due} {amount} {days} {paylink} {upi} {firm} {paidDate}'}. Lines
            whose placeholder is empty (e.g. no UPI ID) are left out.
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {(
              [
                ['invoice', 'Sending an invoice'],
                ['reminder', 'Payment reminder'],
                ['receipt', 'Payment receipt'],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <textarea rows={7} maxLength={2000} value={s.templates[k]} onChange={(e) => set('templates', { ...s.templates, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-2 !px-2 text-xs" onClick={() => set('templates', { ...DEFAULT_SETTINGS.templates })}>
            Reset messages to default
          </Button>
        </div>
      </Card>

      <Card title="Signature (printed on invoices)">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Signatory name" hint='Printed under the signature, above "Authorised Signatory".'>
            <input value={s.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} />
          </Field>
          <Field label="Signature image" hint="A photo or scan of the signature on white paper (PNG/JPG).">
            <div className="flex flex-wrap items-center gap-3">
              {s.signatureDataUrl ? (
                <img src={s.signatureDataUrl} alt="Signature preview" className="h-14 w-auto rounded border border-slate-200 bg-white p-1" />
              ) : (
                <span className="text-sm text-slate-500">No signature</span>
              )}
              <input type="file" accept="image/png,image/jpeg" className="max-w-full text-sm" onChange={(e) => onSignature(e.target.files?.[0])} />
              {s.signatureDataUrl && (
                <Button type="button" variant="ghost" onClick={() => set('signatureDataUrl', null)}>
                  Remove
                </Button>
              )}
            </div>
          </Field>
        </div>
      </Card>

      <Card title="Branding">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Brand colour" error={errors.brandColor}>
            <div className="flex items-center gap-2">
              <input type="color" className="h-10 w-14 p-1" value={HEX_COLOR_RE.test(s.brandColor) ? s.brandColor : '#000000'} onChange={(e) => set('brandColor', e.target.value)} />
              <input className="w-32" value={s.brandColor} onChange={(e) => set('brandColor', e.target.value.trim())} />
            </div>
          </Field>
          <Field label="Logo" hint="Resized to at most 400px wide and stored with the settings.">
            <div className="flex flex-wrap items-center gap-3">
              {s.logoDataUrl ? (
                <img src={s.logoDataUrl} alt="Logo preview" className="h-16 w-auto rounded border border-slate-200 bg-white p-1" />
              ) : (
                <span className="text-sm text-slate-500">No logo</span>
              )}
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="max-w-full text-sm" onChange={(e) => onLogo(e.target.files?.[0])} />
              {s.logoDataUrl && (
                <Button type="button" variant="ghost" onClick={() => set('logoDataUrl', null)}>
                  Remove logo
                </Button>
              )}
            </div>
          </Field>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" busy={busy}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
