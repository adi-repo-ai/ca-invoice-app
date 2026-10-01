import { writeBatch } from 'firebase/firestore';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { callFunction } from '../api';
import { useActor, useAuth } from '../auth';
import { Alert, Button, Card, Field, LinkButton, Loading, Money, PageHeader, StatusBadge, errorMessage } from '../components/ui';
import { appendAudit, listInvoiceAudit, type AuditEntry } from '../data/audit';
import { cancelInvoice, getInvoice, issueInvoice, recordPayment, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { todayIST } from '../lib/fy';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { PAYMENT_MODES, type FirmSettings, type PaymentMode } from '../lib/types';
import { normaliseWhatsapp } from '../lib/validation';
import { useSettings } from '../settings-context';

type Panel = '' | 'email' | 'payment' | 'cancel';

async function makePdf(inv: InvoiceRow, settings: FirmSettings) {
  const { generateInvoicePdf } = await import('../pdf/generate');
  return generateInvoicePdf(inv, settings);
}

function whatsappMessage(inv: InvoiceRow, settings: FirmSettings): string {
  const firm = inv.firm ?? settings;
  const lines = [
    `Dear ${inv.client.contactPerson || inv.client.name},`,
    `Please find attached invoice ${inv.number} dated ${inv.invoiceDate} for Rs. ${formatPaise(inv.totals.grandTotalPaise)}, due by ${inv.dueDate}.`,
  ];
  if (firm.bank.upiId) lines.push(`UPI: ${firm.bank.upiId}`);
  lines.push(`Thank you,`, firm.name);
  return lines.join('\n');
}

export default function InvoiceView() {
  const { id } = useParams();
  const { role } = useAuth();
  const actor = useActor();
  const { settings, saved } = useSettings();
  const [inv, setInv] = useState<InvoiceRow | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [panel, setPanel] = useState<Panel>('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [waLink, setWaLink] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [i, a] = await Promise.all([getInvoice(db, id), listInvoiceAudit(db, id)]);
    if (!i) throw new Error('Invoice not found');
    setInv(i);
    setAudit(a);
  }, [id]);
  useEffect(() => {
    load().catch((e) => setMsg({ kind: 'error', text: errorMessage(e) }));
  }, [load]);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMsg(null);
    try {
      const success = await fn();
      if (success) setMsg({ kind: 'success', text: success });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  if (!inv) return msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : <Loading />;
  const t = inv.totals;
  const intra = inv.taxType === 'INTRA';
  const issuedLike = inv.status !== 'DRAFT';
  const sendable = inv.status === 'ISSUED' || inv.status === 'PAID';
  const wa = normaliseWhatsapp(inv.client.whatsapp);

  const download = () =>
    act('pdf', async () => {
      const { blob, fileName } = await makePdf(inv, settings);
      const { downloadBlob } = await import('../pdf/generate');
      downloadBlob(blob, fileName);
    });

  const shareWhatsapp = () =>
    act('wa', async () => {
      if (!wa) throw new Error('This client has no valid WhatsApp number. Edit the client to add one.');
      const text = whatsappMessage(inv, settings);
      const link = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
      const { blob, fileName } = await makePdf(inv, settings);
      const file = new File([blob], fileName, { type: 'application/pdf' });
      let how = 'download';
      if (navigator.canShare?.({ files: [file] })) {
        // Mobile: native share sheet with the PDF attached (pick WhatsApp).
        try {
          await navigator.share({ files: [file], text });
          how = 'web-share';
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          throw e;
        }
      } else {
        const { downloadBlob } = await import('../pdf/generate');
        downloadBlob(blob, fileName);
      }
      setWaLink(link);
      if (how === 'download') window.open(link, '_blank', 'noopener');
      const batch = writeBatch(db);
      appendAudit(db, batch, actor, inv.id, inv.number ?? null, 'SEND_WHATSAPP', {
        channel: 'whatsapp',
        recipient: `+${wa}`,
        method: how,
      });
      await batch.commit();
      return how === 'download'
        ? `PDF downloaded. WhatsApp opened for +${wa}: attach ${fileName} in the chat.`
        : `Shared via the share sheet. Use the link below to open the chat with +${wa} if needed.`;
    });

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {inv.number ?? 'Draft invoice'} <StatusBadge status={inv.status} />
          </span>
        }
        actions={
          inv.status === 'DRAFT' ? (
            <>
              <LinkButton variant="secondary" to={`/invoices/${inv.id}/edit`}>
                Edit draft
              </LinkButton>
              <Button
                busy={busy === 'issue'}
                onClick={() => {
                  if (!saved) return setMsg({ kind: 'error', text: 'An administrator must save the firm settings before invoices can be issued.' });
                  if (window.confirm('Issue this invoice? It will get the next number and become read-only.'))
                    act('issue', async () => `Issued as ${await issueInvoice(db, actor, inv.id, settings)}.`);
                }}
              >
                Issue invoice
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" busy={busy === 'pdf'} onClick={download}>
                Download PDF
              </Button>
              {sendable && (
                <>
                  <Button variant="secondary" onClick={() => setPanel(panel === 'email' ? '' : 'email')}>
                    Email
                  </Button>
                  <Button variant="secondary" busy={busy === 'wa'} onClick={shareWhatsapp} className="!border-green-600 !text-green-700">
                    Share on WhatsApp
                  </Button>
                </>
              )}
              {inv.status === 'ISSUED' && (
                <Button onClick={() => setPanel(panel === 'payment' ? '' : 'payment')}>Record payment</Button>
              )}
              {inv.status === 'ISSUED' && role === 'ADMIN' && (
                <Button variant="danger" onClick={() => setPanel(panel === 'cancel' ? '' : 'cancel')}>
                  Cancel invoice
                </Button>
              )}
            </>
          )
        }
      />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {waLink && (
        <Alert kind="info">
          <a className="font-medium underline" href={waLink} target="_blank" rel="noopener noreferrer">
            Open WhatsApp chat with +{wa}
          </a>
        </Alert>
      )}

      {panel === 'email' && (
        <EmailPanel
          inv={inv}
          settings={settings}
          onDone={(text) => {
            setPanel('');
            setMsg({ kind: 'success', text });
            load();
          }}
        />
      )}
      {panel === 'payment' && (
        <PaymentPanel
          inv={inv}
          busy={busy === 'pay'}
          onSubmit={(p) =>
            act('pay', async () => {
              await recordPayment(db, actor, inv, p);
              setPanel('');
              return 'Payment recorded; invoice marked PAID.';
            })
          }
        />
      )}
      {panel === 'cancel' && (
        <CancelPanel
          busy={busy === 'cancel'}
          onSubmit={(reason) =>
            act('cancel', async () => {
              await cancelInvoice(db, actor, inv, reason);
              setPanel('');
              return `Invoice cancelled. Number ${inv.number} stays reserved; create a new invoice to reissue.`;
            })
          }
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Bill to">
          <div className="space-y-0.5 text-sm">
            <div className="font-medium">{inv.client.name}</div>
            {inv.client.contactPerson && <div>Attn: {inv.client.contactPerson}</div>}
            <div className="whitespace-pre-line text-slate-600">{inv.client.address}</div>
            <div>
              {inv.client.stateName} ({inv.client.stateCode})
            </div>
            {inv.client.gstin && <div>GSTIN: {inv.client.gstin}</div>}
            {inv.client.email && <div>{inv.client.email}</div>}
            {inv.client.whatsapp && <div>WhatsApp: +{inv.client.whatsapp}</div>}
          </div>
        </Card>
        <Card title="Details">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Invoice date</dt>
            <dd>{inv.invoiceDate}</dd>
            <dt className="text-slate-500">Due date</dt>
            <dd>{inv.dueDate}</dd>
            <dt className="text-slate-500">Tax</dt>
            <dd>{intra ? 'CGST + SGST (intra-state)' : 'IGST (inter-state)'}</dd>
            {inv.payment && (
              <>
                <dt className="text-slate-500">Paid on</dt>
                <dd>
                  {inv.payment.date} · {inv.payment.mode.replace('_', ' ')}
                </dd>
                <dt className="text-slate-500">Received</dt>
                <dd>
                  <Money paise={inv.payment.amountPaise} />
                  {inv.payment.tdsPaise > 0 && (
                    <>
                      {' '}
                      + TDS <Money paise={inv.payment.tdsPaise} />
                    </>
                  )}
                </dd>
                {inv.payment.reference && (
                  <>
                    <dt className="text-slate-500">Reference</dt>
                    <dd>{inv.payment.reference}</dd>
                  </>
                )}
              </>
            )}
            {inv.cancelReason && (
              <>
                <dt className="text-slate-500">Cancel reason</dt>
                <dd className="text-red-700">{inv.cancelReason}</dd>
              </>
            )}
          </dl>
        </Card>
      </div>

      <Card title="Items">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Description</th>
                <th>SAC</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inv.items.map((it, i) => (
                <tr key={i}>
                  <td className="py-2">{it.description}</td>
                  <td>{it.sac}</td>
                  <td className="text-right">{it.qty}</td>
                  <td className="text-right">
                    <Money paise={it.ratePaise} />
                  </td>
                  <td className="text-right">
                    <Money paise={it.amountPaise} />
                  </td>
                </tr>
              ))}
              {inv.reimbursements.map((r, i) => (
                <tr key={`r${i}`} className="text-slate-600">
                  <td className="py-2" colSpan={4}>
                    {r.description} <span className="text-xs">(reimbursement, no GST)</span>
                  </td>
                  <td className="text-right">
                    <Money paise={r.amountPaise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          <TotalRow label="Taxable value" paise={t.taxablePaise} />
          {intra ? (
            <>
              <TotalRow label={`CGST @ ${inv.gstRateBp / 200}%`} paise={t.cgstPaise} />
              <TotalRow label={`SGST @ ${inv.gstRateBp / 200}%`} paise={t.sgstPaise} />
            </>
          ) : (
            <TotalRow label={`IGST @ ${inv.gstRateBp / 100}%`} paise={t.igstPaise} />
          )}
          {t.reimbursementsPaise !== 0 && <TotalRow label="Reimbursements" paise={t.reimbursementsPaise} />}
          {t.roundOffPaise !== 0 && <TotalRow label="Round off" paise={t.roundOffPaise} />}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Grand total</dt>
            <dd>
              <Money paise={t.grandTotalPaise} />
            </dd>
          </div>
          <p className="text-xs text-slate-500">{inv.amountInWords}</p>
        </dl>
      </Card>

      {issuedLike && !inv.firm && <Alert kind="info">Firm details snapshot missing; the PDF uses current settings.</Alert>}

      <Card title="Activity">
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2">
                <span>
                  <span className="font-medium">{a.action.replace('_', ' ')}</span>
                  {a.details?.recipient ? ` → ${String(a.details.recipient)}` : ''}
                  {a.details?.reason ? ` — ${String(a.details.reason)}` : ''}
                  <span className="text-slate-500"> by {a.userEmail}</span>
                </span>
                <span className="text-slate-500">{a.at?.toDate().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TotalRow({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{label}</dt>
      <dd>
        <Money paise={paise} />
      </dd>
    </div>
  );
}

function EmailPanel({ inv, settings, onDone }: { inv: InvoiceRow; settings: FirmSettings; onDone: (msg: string) => void }) {
  const firm = inv.firm ?? settings;
  const [to, setTo] = useState(inv.client.email);
  const [subject, setSubject] = useState(`Invoice ${inv.number} from ${firm.name}`);
  const [body, setBody] = useState(
    [
      `Dear ${inv.client.contactPerson || inv.client.name},`,
      '',
      `Please find attached our invoice ${inv.number} dated ${inv.invoiceDate} for Rs. ${formatPaise(inv.totals.grandTotalPaise)}, due by ${inv.dueDate}.`,
      '',
      firm.bank.accountNumber
        ? `Bank: ${firm.bank.accountName}, A/c ${firm.bank.accountNumber}, IFSC ${firm.bank.ifsc}${firm.bank.upiId ? `, UPI ${firm.bank.upiId}` : ''}`
        : '',
      '',
      'Regards,',
      firm.name,
    ]
      .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
      .join('\n'),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { generateInvoicePdf, blobToBase64 } = await import('../pdf/generate');
      const { blob } = await generateInvoicePdf(inv, settings);
      const pdfBase64 = await blobToBase64(blob);
      await callFunction('send-invoice-email', { invoiceId: inv.id, to, subject, body, pdfBase64 });
      onDone(`Email sent to ${to} with the PDF attached.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Email invoice">
      <form onSubmit={send} className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Field label="To">
          <input type="email" required value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Subject">
          <input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <textarea rows={8} required maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" busy={busy}>
            Send with PDF
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PaymentPanel({
  inv,
  busy,
  onSubmit,
}: {
  inv: InvoiceRow;
  busy: boolean;
  onSubmit: (p: { date: string; mode: PaymentMode; amountPaise: number; tdsPaise: number; reference: string }) => void;
}) {
  const [date, setDate] = useState(todayIST());
  const [mode, setMode] = useState<PaymentMode>('BANK_TRANSFER');
  const [amount, setAmount] = useState(paiseToInput(inv.totals.grandTotalPaise));
  const [tds, setTds] = useState('0');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    const amountPaise = parseRupeesToPaise(amount);
    const tdsPaise = parseRupeesToPaise(tds || '0');
    if (amountPaise === null || amountPaise < 0) return setError('Enter a valid amount received.');
    if (tdsPaise === null || tdsPaise < 0) return setError('Enter a valid TDS amount.');
    if (amountPaise + tdsPaise === 0) return setError('Amount received and TDS cannot both be zero.');
    if (date > todayIST()) return setError('Payment date cannot be in the future.');
    const settled = amountPaise + tdsPaise;
    if (settled !== inv.totals.grandTotalPaise &&
      !window.confirm(`Amount + TDS (₹${formatPaise(settled)}) differs from the invoice total (₹${formatPaise(inv.totals.grandTotalPaise)}). Mark as PAID anyway?`)) return;
    onSubmit({ date, mode, amountPaise, tdsPaise, reference: reference.trim() });
  }

  return (
    <Card title="Record payment">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        {error && <div className="sm:col-span-2 lg:col-span-5"><Alert>{error}</Alert></div>}
        <Field label="Payment date">
          <input type="date" required value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount received (₹)">
          <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="TDS deducted (₹)">
          <input inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value)} />
        </Field>
        <Field label="Reference (UTR / cheque no.)">
          <input maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
          <Button type="submit" busy={busy}>
            Mark as paid
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CancelPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Card title="Cancel invoice">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length >= 3 && window.confirm('Cancel this invoice? This cannot be undone.')) onSubmit(reason);
        }}
        className="space-y-3"
      >
        <p className="text-sm text-slate-600">
          The invoice number stays reserved and the invoice is kept for records. To correct it, create and issue a new invoice.
        </p>
        <Field label="Reason (required)">
          <textarea rows={3} required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button variant="danger" type="submit" busy={busy} disabled={reason.trim().length < 3}>
            Cancel invoice
          </Button>
        </div>
      </form>
    </Card>
  );
}

