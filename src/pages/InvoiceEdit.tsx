import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useActor } from '../auth';
import { ClientFields } from '../components/ClientFields';
import { ClientPicker } from '../components/ClientPicker';
import { useDialog } from '../components/Dialog';
import { Alert, Button, Card, Field, Loading, Money, PageHeader, Switch, Tip, errorMessage } from '../components/ui';
import { createClient, getClient, type ClientInput, type ClientRow } from '../data/clients';
import { clientSnapshot, createDraft, getInvoice, issueInvoice, updateDraft, type DraftInput } from '../data/invoices';
import { db } from '../firebase';
import { paiseToInput, parseRupeesToPaise } from '../lib/money';
import { computeInvoice } from '../lib/tax';
import type { ClientSnapshot, SacCode } from '../lib/types';
import { normaliseWhatsapp } from '../lib/validation';
import { useSettings } from '../settings-context';
import { validateClient } from './ClientEdit';

interface ItemRow {
  service: string; // index into settings.sacCodes, '' = none chosen
  description: string;
  sac: string;
  qty: string;
  rate: string; // rupees as typed
}
interface ReimbRow {
  description: string;
  amount: string;
}
type ClientMode = 'saved' | 'new';

function parseQty(q: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(q.trim())) return null;
  const n = Number(q);
  return n > 0 && n <= 100000 ? n : null;
}

const emptyLine = (): ItemRow => ({ service: '', description: '', sac: '', qty: '1', rate: '' });

/** Which configured service a stored line came from (for editing drafts). */
function serviceIndex(services: SacCode[], sac: string, description: string): string {
  let i = services.findIndex((c) => c.code === sac && c.description === description);
  if (i < 0) i = services.findIndex((c) => c.code === sac);
  return i < 0 ? '' : String(i);
}

export default function InvoiceEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const actor = useActor();
  const dialog = useDialog();
  const { settings, saved } = useSettings();
  const services = settings.sacCodes;

  const [loading, setLoading] = useState(Boolean(id) || params.has('client') || params.has('from'));
  // Client: pick a saved one, or type details (optionally saving them to the list).
  const [mode, setMode] = useState<ClientMode>('saved');
  const [client, setClient] = useState<ClientRow | null>(null);
  const [newClient, setNewClient] = useState<ClientInput>({
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
  const [saveNewClient, setSaveNewClient] = useState(true);
  const [clientErrors, setClientErrors] = useState<ReturnType<typeof validateClient>>({});
  const [items, setItems] = useState<ItemRow[]>([emptyLine()]);
  const [reimbs, setReimbs] = useState<ReimbRow[]>([]);
  const [terms, setTerms] = useState(settings.defaultTerms);
  const [notes, setNotes] = useState('');
  const [includeSignature, setIncludeSignature] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'issue'>('');
  // Remember records created by this form so a retry doesn't duplicate them.
  const createdId = useRef<string | undefined>(undefined);
  const createdClientId = useRef<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        // Editing a draft, or duplicating any invoice (?from=<id>) into a new draft.
        const sourceId = id ?? params.get('from');
        if (sourceId) {
          const inv = await getInvoice(db, sourceId);
          if (!inv) return setError('Invoice not found');
          if (id && inv.status !== 'DRAFT') return navigate(`/invoices/${id}`, { replace: true });
          const c = inv.clientId ? await getClient(db, inv.clientId) : null;
          if (c) {
            setMode('saved');
            setClient(c);
          } else {
            // One-off client (or a client that was since removed): edit the details inline.
            setMode('new');
            setSaveNewClient(false);
            setNewClient({ ...inv.client });
          }
          setItems(
            inv.items.map((it) => ({
              service: serviceIndex(services, it.sac, it.description),
              description: it.description,
              sac: it.sac,
              qty: String(it.qty),
              rate: paiseToInput(it.ratePaise),
            })),
          );
          setReimbs(inv.reimbursements.map((r) => ({ description: r.description, amount: paiseToInput(r.amountPaise) })));
          setTerms(inv.terms);
          setNotes(inv.notes ?? '');
          setIncludeSignature(inv.includeSignature ?? true);
        } else if (params.get('client')) {
          setClient(await getClient(db, params.get('client')!));
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, params, navigate]);

  /** The client details that will go on the invoice. */
  const snapshot: ClientSnapshot | null = useMemo(() => {
    if (mode === 'saved') return client ? clientSnapshot(client) : null;
    const wa = newClient.whatsapp ? (normaliseWhatsapp(newClient.whatsapp) ?? newClient.whatsapp) : '';
    return { ...newClient, name: newClient.name.trim(), email: newClient.email.trim(), whatsapp: wa };
  }, [mode, client, newClient]);

  // Parse + validate the services into invoice lines (or a list of problems).
  const parsed = useMemo(() => {
    const problems: string[] = [];
    const its = items.map((r, i) => {
      const qty = parseQty(r.qty);
      const ratePaise = parseRupeesToPaise(r.rate);
      if (!r.sac) problems.push(`Line ${i + 1}: choose a service.`);
      if (!r.description.trim()) problems.push(`Line ${i + 1}: description is required.`);
      if (qty === null) problems.push(`Line ${i + 1}: quantity must be a positive number (max 2 decimals).`);
      if (ratePaise === null || ratePaise < 0) problems.push(`Line ${i + 1}: enter a valid price.`);
      return { description: r.description.trim(), sac: r.sac, qty: qty ?? 0, ratePaise: ratePaise ?? 0 };
    });
    if (its.length === 0) problems.push('Add at least one service.');
    const rs = reimbs.map((r, i) => {
      const amountPaise = parseRupeesToPaise(r.amount);
      if (!r.description.trim()) problems.push(`Reimbursement ${i + 1}: description is required.`);
      if (amountPaise === null || amountPaise <= 0) problems.push(`Reimbursement ${i + 1}: enter a valid amount.`);
      return { description: r.description.trim(), amountPaise: amountPaise ?? 0 };
    });
    const preview = computeInvoice({
      items: its,
      reimbursements: rs,
      gstRateBp: settings.gstRateBp,
      firmStateCode: settings.stateCode,
      clientStateCode: snapshot?.stateCode || settings.stateCode,
      chargeGst: settings.chargeGst,
    });
    return { problems, preview, its, rs };
  }, [items, reimbs, settings, snapshot]);

  /** Resolve the client (saving a new one if asked) and build the draft input. */
  async function buildInput(): Promise<DraftInput | null> {
    if (mode === 'saved') {
      if (!client) {
        setError('Choose a saved client, or switch to "New / one-off client" and type the details.');
        return null;
      }
      return { clientId: client.id, client: clientSnapshot(client), items: parsed.its, reimbursements: parsed.rs, terms, notes, includeSignature };
    }
    const errs = validateClient(snapshot as ClientInput, settings.chargeGst);
    setClientErrors(errs);
    if (Object.keys(errs).length) {
      setError('Please check the client details.');
      return null;
    }
    let clientId = '';
    if (saveNewClient) {
      clientId = createdClientId.current ?? (createdClientId.current = await createClient(db, actor.uid, snapshot as ClientInput));
    }
    return { clientId, client: snapshot!, items: parsed.its, reimbursements: parsed.rs, terms, notes, includeSignature };
  }

  async function save(issue: boolean) {
    if (parsed.problems.length) return setError(parsed.problems.join(' '));
    if (issue) {
      if (!saved) return setError('Please fill in and save Settings (firm details) once before creating invoices.');
      if (!(await dialog.confirm({ title: 'Create this invoice?', message: 'It gets the next invoice number and can no longer be edited.', confirmText: 'Create invoice' }))) return;
    }
    setBusy(issue ? 'issue' : 'save');
    setError('');
    try {
      const input = await buildInput();
      if (!input) return;
      let invoiceId = id ?? createdId.current;
      if (invoiceId) await updateDraft(db, actor, invoiceId, input, settings);
      else invoiceId = createdId.current = await createDraft(db, actor, input, settings);
      if (issue) await issueInvoice(db, actor, invoiceId, settings);
      navigate(`/invoices/${invoiceId}`, { state: { justIssued: issue } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  if (loading) return <Loading />;
  const t = parsed.preview.totals;
  const intra = parsed.preview.taxType === 'INTRA';
  const setItem = (i: number, k: keyof ItemRow, v: string) => setItems(items.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setReimb = (i: number, k: keyof ReimbRow, v: string) => setReimbs(reimbs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  /** Choosing a service fills in its description, SAC code and default price. */
  function chooseService(i: number, value: string) {
    const svc = value === '' ? null : services[Number(value)];
    setItems(
      items.map((r, j) => {
        if (j !== i) return r;
        if (!svc) return { ...r, service: '', sac: '' };
        const prev = r.service === '' ? null : services[Number(r.service)];
        const keepDescription = r.description.trim() && r.description !== prev?.description;
        return {
          ...r,
          service: value,
          sac: svc.code,
          description: keepDescription ? r.description : svc.description,
          rate: svc.ratePaise ? paiseToInput(svc.ratePaise) : r.rate,
        };
      }),
    );
  }

  const modeBtn = (m: ClientMode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError('');
      }}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-[var(--brand)] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={id ? 'Edit draft invoice' : params.get('from') ? 'New invoice (copy)' : 'New invoice'} subtitle={!id && params.get('from') ? 'Copied from an earlier invoice: check the details, then save or create.' : undefined} />
      {error && <Alert>{error}</Alert>}

      <Card title="1. Client">
        <div className="mb-3 flex flex-wrap gap-2">
          {modeBtn('saved', 'Saved client')}
          {modeBtn('new', 'New / one-off client')}
        </div>
        {mode === 'saved' ? (
          <ClientPicker value={client} onChange={setClient} />
        ) : (
          <div className="space-y-3">
            <ClientFields value={newClient} onChange={setNewClient} errors={clientErrors} stateRequired={settings.chargeGst} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={saveNewClient} onChange={(e) => setSaveNewClient(e.target.checked)} />
              Save this client to my client list for next time
            </label>
          </div>
        )}
      </Card>

      <Card title="2. Services">
        <div className="space-y-3">
          {items.map((r, i) => {
            const amount = parsed.preview.items[i]?.amountPaise ?? 0;
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-12 sm:items-end">
                <Field
                  label="Service"
                  className="col-span-2 sm:col-span-4"
                  hint={
                    i === 0 ? (
                      <span className="inline-flex items-center gap-1">
                        Fills description, SAC and price <Tip label="What is SAC?">SAC (Services Accounting Code) is the GST code for a type of service, e.g. 998231 for tax consulting. Manage your list and default prices in Settings → Services you bill.</Tip>
                      </span>
                    ) : undefined
                  }
                >
                  <select value={r.service} onChange={(e) => chooseService(i, e.target.value)}>
                    <option value="">Choose a service…</option>
                    {services.map((c, k) => (
                      <option key={k} value={String(k)}>
                        {c.description || 'Service'} (SAC {c.code}){c.ratePaise ? ` – ₹${paiseToInput(c.ratePaise)}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Description on invoice" className="col-span-2 sm:col-span-4">
                  <input value={r.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                </Field>
                <Field label="Qty" className="sm:col-span-1">
                  <input inputMode="decimal" value={r.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                </Field>
                <Field label="Price (₹)" className="sm:col-span-2">
                  <input inputMode="decimal" value={r.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
                </Field>
                <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                  <Money paise={amount} className="text-sm font-medium" />
                  {items.length > 1 && (
                    <button type="button" className="text-xs text-red-600" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {services.length === 0 && (
            <p className="text-sm text-amber-700">No services set up yet: add them in Settings → Firm details → Services you bill.</p>
          )}
          <Button type="button" variant="secondary" onClick={() => setItems([...items, emptyLine()])}>
            + Add another service
          </Button>
          {reimbs.length === 0 && (
            <button type="button" className="ml-3 text-sm font-medium text-[var(--brand)]" onClick={() => setReimbs([{ description: '', amount: '' }])}>
              + Add reimbursement (no GST)
            </button>
          )}
        </div>
      </Card>

      {reimbs.length > 0 && (
      <Card title="Reimbursements (no GST) — e.g. government / ROC fees paid for the client">
        <div className="space-y-3">
          {reimbs.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-end">
              <Field label="Description" className="col-span-2 sm:col-span-8">
                <input value={r.description} onChange={(e) => setReimb(i, 'description', e.target.value)} />
              </Field>
              <Field label="Amount (₹)" className="sm:col-span-3">
                <input inputMode="decimal" value={r.amount} onChange={(e) => setReimb(i, 'amount', e.target.value)} />
              </Field>
              <div className="flex items-end justify-end sm:col-span-1">
                <button type="button" className="pb-2 text-xs text-red-600" onClick={() => setReimbs(reimbs.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setReimbs([...reimbs, { description: '', amount: '' }])}>
            Add another
          </Button>
        </div>
      </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <Card title="Notes (printed on the invoice)">
            <textarea
              rows={3}
              className="w-full"
              placeholder="e.g. Thank you for your business."
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Show signature on the invoice</div>
                <div className="text-xs text-slate-500">
                  {includeSignature ? 'Shown: signature block printed on the PDF.' : 'Hidden: no signature block on the PDF.'}
                  {!settings.signatureDataUrl && ' Upload a signature image in Settings.'}
                </div>
              </div>
              <Switch checked={includeSignature} onChange={setIncludeSignature} label="Show signature on the invoice" />
            </div>
          </Card>
          <Card>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Terms &amp; conditions (optional to change)</summary>
              <textarea rows={5} className="mt-3 w-full" value={terms} onChange={(e) => setTerms(e.target.value)} />
            </details>
          </Card>
        </div>
        <Card title="3. Total">
          <dl className="space-y-1 text-sm">
            <Row label="Total Amount" paise={settings.chargeGst ? t.taxablePaise : t.taxablePaise + t.reimbursementsPaise} />
            {settings.chargeGst &&
              (intra ? (
                <>
                  <Row label={`CGST @ ${settings.gstRateBp / 200}%`} paise={t.cgstPaise} />
                  <Row label={`SGST @ ${settings.gstRateBp / 200}%`} paise={t.sgstPaise} />
                </>
              ) : (
                <Row label={`IGST @ ${settings.gstRateBp / 100}%`} paise={t.igstPaise} />
              ))}
            {settings.chargeGst && t.reimbursementsPaise !== 0 && <Row label="Reimbursements" paise={t.reimbursementsPaise} />}
            {t.roundOffPaise !== 0 && <Row label="Round off" paise={t.roundOffPaise} />}
            <div className="!mt-4 flex justify-between border-t border-slate-200 pt-4 text-base font-semibold">
              <dt>Total Invoice Value</dt>
              <dd>
                <Money paise={t.grandTotalPaise} />
              </dd>
            </div>
            <p className="pt-1 text-xs text-slate-500">{parsed.preview.amountInWords}</p>
            {settings.chargeGst && snapshot?.stateName && (
              <p className="pt-1 text-xs text-slate-500">
                {intra ? 'Same state: CGST + SGST' : 'Other state: IGST'} · Place of supply {snapshot.stateName}
              </p>
            )}
          </dl>
        </Card>
      </div>

      <div className="sticky bottom-0 -mx-3 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
        <Button variant="secondary" busy={busy === 'save'} disabled={!!busy} onClick={() => save(false)}>
          Save as draft
        </Button>
        <Button busy={busy === 'issue'} disabled={!!busy} onClick={() => save(true)}>
          Create invoice
        </Button>
      </div>
    </div>
  );
}

function Row({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd>
        <Money paise={paise} />
      </dd>
    </div>
  );
}
