import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useActor } from '../auth';
import { ClientPicker } from '../components/ClientPicker';
import { QuickClientForm } from '../components/QuickClientForm';
import { Alert, Button, Card, Field, Loading, Money, PageHeader, errorMessage } from '../components/ui';
import { getClient, type ClientRow } from '../data/clients';
import { clientSnapshot, createDraft, getInvoice, issueInvoice, updateDraft, type DraftInput } from '../data/invoices';
import { db } from '../firebase';
import { paiseToInput, parseRupeesToPaise } from '../lib/money';
import { computeInvoice } from '../lib/tax';
import { useSettings } from '../settings-context';

interface ItemRow {
  description: string;
  sac: string;
  qty: string;
  rate: string; // rupees as typed
}
interface ReimbRow {
  description: string;
  amount: string;
}

function parseQty(q: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(q.trim())) return null;
  const n = Number(q);
  return n > 0 && n <= 100000 ? n : null;
}

export default function InvoiceEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const actor = useActor();
  const { settings, saved } = useSettings();

  const [loading, setLoading] = useState(Boolean(id) || params.has('client'));
  const [client, setClient] = useState<ClientRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([{ description: '', sac: settings.sacCodes[0]?.code ?? '', qty: '1', rate: '' }]);
  const [reimbs, setReimbs] = useState<ReimbRow[]>([]);
  const [terms, setTerms] = useState(settings.defaultTerms);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'issue'>('');
  const [addingClient, setAddingClient] = useState(false);
  // Remembers a draft created by this form so a retry updates it instead of
  // creating a duplicate (e.g. when "Save & issue" saved but issuing failed).
  const createdId = useRef<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const inv = await getInvoice(db, id);
          if (!inv) return setError('Invoice not found');
          if (inv.status !== 'DRAFT') return navigate(`/invoices/${id}`, { replace: true });
          const c = await getClient(db, inv.clientId);
          setClient(c ?? { id: inv.clientId, ...inv.client, nameLower: inv.client.name.toLowerCase() });
          setItems(inv.items.map((it) => ({ description: it.description, sac: it.sac, qty: String(it.qty), rate: paiseToInput(it.ratePaise) })));
          setReimbs(inv.reimbursements.map((r) => ({ description: r.description, amount: paiseToInput(r.amountPaise) })));
          setTerms(inv.terms);
        } else if (params.get('client')) {
          setClient(await getClient(db, params.get('client')!));
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, params, navigate]);

  // Parse + validate the form into a DraftInput (or a list of problems).
  const parsed = useMemo(() => {
    const problems: string[] = [];
    if (!client) problems.push('Choose a client.');
    const its = items.map((r, i) => {
      const qty = parseQty(r.qty);
      const ratePaise = parseRupeesToPaise(r.rate);
      if (!r.description.trim()) problems.push(`Line ${i + 1}: description is required.`);
      if (!r.sac) problems.push(`Line ${i + 1}: choose a SAC code.`);
      if (qty === null) problems.push(`Line ${i + 1}: quantity must be a positive number (max 2 decimals).`);
      if (ratePaise === null || ratePaise < 0) problems.push(`Line ${i + 1}: enter a valid rate.`);
      return { description: r.description.trim(), sac: r.sac, qty: qty ?? 0, ratePaise: ratePaise ?? 0 };
    });
    if (its.length === 0) problems.push('Add at least one line item.');
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
      clientStateCode: client?.stateCode ?? settings.stateCode,
    });
    const input: DraftInput | null = client
      ? { clientId: client.id, client: clientSnapshot(client), items: its, reimbursements: rs, terms }
      : null;
    return { problems, preview, input };
  }, [client, items, reimbs, terms, settings]);

  async function save(issue: boolean) {
    if (parsed.problems.length || !parsed.input) return setError(parsed.problems.join(' '));
    if (issue) {
      if (!saved) return setError('An administrator must save the firm settings before invoices can be issued.');
      if (!window.confirm('Create this invoice? It gets the next invoice number and can no longer be edited.')) return;
    }
    setBusy(issue ? 'issue' : 'save');
    setError('');
    try {
      let invoiceId = id ?? createdId.current;
      if (invoiceId) await updateDraft(db, actor, invoiceId, parsed.input, settings);
      else invoiceId = createdId.current = await createDraft(db, actor, parsed.input, settings);
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

  return (
    <div className="space-y-4">
      <PageHeader title={id ? 'Edit draft invoice' : 'New invoice'} />
      {error && <Alert>{error}</Alert>}

      <Card title="1. Client">
        {addingClient ? (
          <QuickClientForm
            onCreated={(c) => {
              setClient(c);
              setAddingClient(false);
            }}
            onCancel={() => setAddingClient(false)}
          />
        ) : (
          <>
            <ClientPicker value={client} onChange={setClient} />
            <button type="button" className="mt-2 text-sm font-medium text-[var(--brand)]" onClick={() => setAddingClient(true)}>
              + Add a new client
            </button>
          </>
        )}
      </Card>

      <Card title="2. Services">
        <div className="space-y-3">
          {items.map((r, i) => {
            const amount = parsed.preview.items[i]?.amountPaise ?? 0;
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-12 sm:items-end sm:border-0 sm:p-0">
                <Field label="Description" className="col-span-2 sm:col-span-5">
                  <input value={r.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                </Field>
                <Field label="SAC" className="col-span-2 sm:col-span-2">
                  <select value={r.sac} onChange={(e) => setItem(i, 'sac', e.target.value)}>
                    <option value="">Select…</option>
                    {settings.sacCodes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} – {c.description}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Qty" className="sm:col-span-1">
                  <input inputMode="decimal" value={r.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                </Field>
                <Field label="Rate (₹)" className="sm:col-span-2">
                  <input inputMode="decimal" value={r.rate} onChange={(e) => setItem(i, 'rate', e.target.value)} />
                </Field>
                <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-2 sm:flex-col sm:items-end">
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
          <Button type="button" variant="secondary" onClick={() => setItems([...items, { description: '', sac: settings.sacCodes[0]?.code ?? '', qty: '1', rate: '' }])}>
            Add line
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
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Terms printed on the invoice (optional to change)</summary>
            <textarea rows={5} className="mt-3 w-full" value={terms} onChange={(e) => setTerms(e.target.value)} />
          </details>
        </Card>
        <Card title="3. Total">
          <dl className="space-y-1 text-sm">
            <Row label="Taxable value" paise={t.taxablePaise} />
            {intra ? (
              <>
                <Row label={`CGST @ ${settings.gstRateBp / 200}%`} paise={t.cgstPaise} />
                <Row label={`SGST @ ${settings.gstRateBp / 200}%`} paise={t.sgstPaise} />
              </>
            ) : (
              <Row label={`IGST @ ${settings.gstRateBp / 100}%`} paise={t.igstPaise} />
            )}
            <Row label="Reimbursements (no GST)" paise={t.reimbursementsPaise} />
            <Row label="Round off" paise={t.roundOffPaise} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt>Grand total</dt>
              <dd>
                <Money paise={t.grandTotalPaise} />
              </dd>
            </div>
            <p className="pt-1 text-xs text-slate-500">{parsed.preview.amountInWords}</p>
            {client && (
              <p className="pt-1 text-xs text-slate-500">
                {intra ? 'Intra-state supply: CGST + SGST' : 'Inter-state supply: IGST'} · Place of supply {client.stateName} ({client.stateCode})
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
