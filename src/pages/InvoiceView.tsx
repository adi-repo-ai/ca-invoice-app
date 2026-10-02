import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useActor, useAuth } from '../auth';
import { Alert, Button, Card, Field, LinkButton, Loading, Money, PageHeader, StatusBadge, Tip, errorMessage } from '../components/ui';
import { DownloadIcon, EyeIcon, MailIcon, TrashIcon, WhatsAppIcon } from '../components/icons';
import { useDialog } from '../components/Dialog';
import { listInvoiceAudit, timeAgo, type AuditEntry } from '../data/audit';
import { cancelInvoice, deleteInvoices, getInvoice, issueInvoice, recordPayment, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { todayIST } from '../lib/fy';
import { formatPaise, paiseToInput, parseRupeesToPaise } from '../lib/money';
import { PAYMENT_MODES, type FirmSettings, type PaymentMode } from '../lib/types';
import { normaliseWhatsapp } from '../lib/validation';
import { checkPop, confetti } from '../lib/celebrate';
import { daysBetween, type MessageKind } from '../lib/messages';
import { sendDocument, type Channel } from '../lib/send';
import { useSettings } from '../settings-context';

type Panel = '' | 'payment' | 'cancel';

async function makePdf(inv: InvoiceRow, settings: FirmSettings) {
  const { generateInvoicePdf } = await import('../pdf/generate');
  return generateInvoicePdf(inv, settings);
}

export default function InvoiceView() {
  const { id } = useParams();
  const { role, pay } = useAuth();
  const actor = useActor();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { settings, saved } = useSettings();
  const [inv, setInv] = useState<InvoiceRow | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [panel, setPanel] = useState<Panel>('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [openLink, setOpenLink] = useState<{ channel: 'email' | 'whatsapp'; href: string } | null>(null);
  const location = useLocation();
  useEffect(() => {
    if ((location.state as { justIssued?: boolean } | null)?.justIssued) {
      setMsg({ kind: 'success', text: 'Invoice created. Send it to your client below.' });
    }
  }, [location.state]);

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
  const gst = inv.taxType !== 'NONE';
  const issuedLike = inv.status !== 'DRAFT';
  const wa = normaliseWhatsapp(inv.client.whatsapp);
  const canDelete = role === 'ADMIN'; // only ADMINs delete invoices
  const overdueDays = inv.status === 'ISSUED' ? Math.max(0, daysBetween(inv.dueDate, todayIST())) : 0;
  const reminded = audit.find((a) => a.details?.kind === 'reminder');
  const lastReminder = reminded ? timeAgo(reminded.at?.toDate()) : '';

  async function remove() {
    const ok = await dialog.confirm({
      title: `Delete ${inv!.number ?? 'this draft'}?`,
      message:
        inv!.status === 'DRAFT'
          ? 'This draft will be permanently deleted.'
          : `Invoice ${inv!.number} will be permanently deleted. Its number will not be reused. This cannot be undone.`,
      confirmText: 'Delete invoice',
      danger: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteInvoices(db, actor, [inv!]);
      navigate('/invoices', { replace: true });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
      setBusy('');
    }
  }

  /**
   * Drafts have no invoice number yet, so the PDF / share buttons first create
   * (issue) the invoice, after confirming, and then continue with it.
   */
  async function confirmIssueIfDraft(): Promise<boolean> {
    if (inv!.status !== 'DRAFT') return true;
    if (!saved) {
      setMsg({ kind: 'error', text: 'Please fill in and save Settings (firm details) once before creating invoices.' });
      return false;
    }
    return dialog.confirm({
      title: 'Create the invoice first?',
      message: 'This is a draft. It will get the next invoice number and can no longer be edited.',
      confirmText: 'Create & continue',
    });
  }
  async function readyInvoice(): Promise<InvoiceRow> {
    if (inv!.status !== 'DRAFT') return inv!;
    await issueInvoice(db, actor, inv!.id, settings);
    const fresh = await getInvoice(db, inv!.id);
    if (!fresh) throw new Error('Invoice not found');
    setInv(fresh);
    return fresh;
  }

  // Open the window straight away (inside the click) so pop-up blockers allow it.
  const view = async () => {
    if (!(await confirmIssueIfDraft())) return;
    const win = window.open('', '_blank');
    act('view', async () => {
      const current = await readyInvoice();
      const { blob, fileName } = await makePdf(current, settings);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else {
        const { downloadBlob } = await import('../pdf/generate');
        downloadBlob(blob, fileName);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  };

  const download = async () => {
    if (!(await confirmIssueIfDraft())) return;
    act('pdf', async () => {
      const current = await readyInvoice();
      const { blob, fileName } = await makePdf(current, settings);
      const { downloadBlob } = await import('../pdf/generate');
      downloadBlob(blob, fileName);
      return `PDF downloaded: ${fileName}`;
    });
  };

  /**
   * Send via the user's own apps. On phones the share sheet opens with the
   * PDF attached (pick Gmail / WhatsApp). On computers (or if sharing isn't
   * allowed) the PDF is downloaded and a ready-written email or WhatsApp chat
   * opens for the user to attach it. Works even without a saved email/number.
   */
  const send = async (channel: Channel, kind: MessageKind = 'invoice') => {
    if (kind === 'invoice' && !(await confirmIssueIfDraft())) return;
    act(`${kind}-${channel}`, async () => {
      const current = kind === 'invoice' ? await readyInvoice() : inv!;
      const res = await sendDocument({ db, actor, inv: current, settings, channel, kind });
      if (!res) return;
      setOpenLink({ channel, href: res.href });
      return res.message;
    });
  };

  const downloadReceipt = () =>
    act('receipt-pdf', async () => {
      const { generateReceiptPdf, downloadBlob } = await import('../pdf/generate');
      const { blob, fileName } = await generateReceiptPdf(inv!, settings);
      downloadBlob(blob, fileName);
      return `Receipt downloaded: ${fileName}`;
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
                onClick={async () => {
                  if (!saved) return setMsg({ kind: 'error', text: 'Please fill in and save Settings before creating invoices.' });
                  if (
                    await dialog.confirm({
                      title: 'Create this invoice?',
                      message: 'It gets the next invoice number and can no longer be edited.',
                      confirmText: 'Create invoice',
                    })
                  )
                    act('issue', async () => {
                      const n = await issueInvoice(db, actor, inv.id, settings);
                      checkPop();
                      return `Invoice ${n} created. Send it to your client below.`;
                    });
                }}
              >
                Create invoice
              </Button>
            </>
          ) : undefined
        }
      />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <Card title={inv.status === 'CANCELLED' ? 'Invoice PDF' : 'Download or send to client'}>
        {inv.status === 'DRAFT' && (
          <p className="mb-3 text-sm text-slate-600">This is a draft. Any button below creates the invoice (with its number) first.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button variant="secondary" className="gap-2 py-3" busy={busy === 'view'} onClick={view}>
            <EyeIcon /> View PDF
          </Button>
          <Button variant="secondary" className="gap-2 py-3" busy={busy === 'pdf'} onClick={download}>
            <DownloadIcon /> Download PDF
          </Button>
          {inv.status !== 'CANCELLED' && (
            <>
              <Button variant="secondary" className="gap-2 py-3" busy={busy === 'invoice-email'} onClick={() => send('email')}>
                <MailIcon /> <span className="truncate">Send by email</span>
              </Button>
              <Button variant="secondary" className="gap-2 !border-green-600 py-3 !text-green-700" busy={busy === 'invoice-whatsapp'} onClick={() => send('whatsapp')}>
                <WhatsAppIcon /> Send to WhatsApp
              </Button>
            </>
          )}
        </div>
        {inv.status !== 'CANCELLED' && (inv.client.email || wa) && (
          <p className="mt-2 text-xs text-slate-500">
            {[inv.client.email && `Email: ${inv.client.email}`, wa && `WhatsApp: +${wa}`].filter(Boolean).join(' · ')}
          </p>
        )}
          {openLink && (
            <p className="mt-3 text-sm">
              <a className="font-medium text-[var(--brand)] underline" href={openLink.href} target="_blank" rel="noopener noreferrer">
                {openLink.channel === 'email' ? 'Open the email again' : 'Open the WhatsApp chat again'}
              </a>
            </p>
          )}
        {inv.status === 'ISSUED' && (
          <div className={`mt-4 rounded-xl border p-3 ${overdueDays > 0 ? 'border-red-200 bg-red-50/60' : 'border-slate-200 bg-slate-50'}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Payment reminder</span>
              {overdueDays > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{overdueDays} days overdue</span>
              ) : (
                <span className="text-xs text-slate-500">Due {inv.dueDate}</span>
              )}
              {lastReminder && <span className="text-xs text-slate-500">· last reminded {lastReminder}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="gap-2 !border-green-600 !text-green-700" busy={busy === 'reminder-whatsapp'} onClick={() => send('whatsapp', 'reminder')}>
                <WhatsAppIcon size={16} /> Remind on WhatsApp
              </Button>
              <Button variant="secondary" className="gap-2" busy={busy === 'reminder-email'} onClick={() => send('email', 'reminder')}>
                <MailIcon size={16} /> Remind by email
              </Button>
            </div>
          </div>
        )}
        {inv.status === 'PAID' && inv.payment && pay && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-3">
            <div className="mb-2 text-sm font-medium text-green-800">Payment receipt</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="gap-2" busy={busy === 'receipt-pdf'} onClick={downloadReceipt}>
                <DownloadIcon size={16} /> Download receipt
              </Button>
              <Button variant="secondary" className="gap-2 !border-green-600 !text-green-700" busy={busy === 'receipt-whatsapp'} onClick={() => send('whatsapp', 'receipt')}>
                <WhatsAppIcon size={16} /> Send receipt on WhatsApp
              </Button>
              <Button variant="secondary" className="gap-2" busy={busy === 'receipt-email'} onClick={() => send('email', 'receipt')}>
                <MailIcon size={16} /> Email receipt
              </Button>
            </div>
          </div>
        )}
        {(inv.status === 'ISSUED' || canDelete || issuedLike) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {inv.status === 'ISSUED' && pay && (
              <Button variant="ghost" onClick={() => setPanel(panel === 'payment' ? '' : 'payment')}>
                ✓ Mark as paid
              </Button>
            )}
            {inv.status === 'ISSUED' && role === 'ADMIN' && (
              <Button variant="ghost" className="!text-red-600" onClick={() => setPanel(panel === 'cancel' ? '' : 'cancel')}>
                Cancel invoice
              </Button>
            )}
            {issuedLike && (
              <LinkButton variant="ghost" to={`/invoices/new?from=${inv.id}`}>
                ⧉ Duplicate
              </LinkButton>
            )}
            {canDelete && (
              <Button variant="ghost" className="gap-2 !text-red-600 sm:ml-auto" busy={busy === 'delete'} onClick={remove}>
                <TrashIcon size={16} /> Delete invoice
              </Button>
            )}
          </div>
        )}
      </Card>

      {panel === 'payment' && (
        <PaymentPanel
          inv={inv}
          busy={busy === 'pay'}
          onSubmit={(p) =>
            act('pay', async () => {
              await recordPayment(db, actor, inv, p);
              setPanel('');
              confetti();
              return 'Payment recorded; invoice marked PAID. 🎉 You can now send the client a receipt.';
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
            {inv.client.stateName && <div>Place of supply: {inv.client.stateName}</div>}
            {inv.client.gstin && <div>GSTIN: {inv.client.gstin}</div>}
            {inv.client.email && <div>{inv.client.email}</div>}
            {inv.client.whatsapp && <div>Mobile: +{inv.client.whatsapp}</div>}
          </div>
        </Card>
        <Card title="Details">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Invoice date</dt>
            <dd>{inv.invoiceDate}</dd>
            <dt className="text-slate-500">Due date</dt>
            <dd>{inv.dueDate}</dd>
            {gst && (
              <>
                <dt className="text-slate-500">GST</dt>
                <dd>{intra ? 'CGST + SGST (same state)' : 'IGST (other state)'}</dd>
              </>
            )}
            {inv.payment && pay && (
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
          <TotalRow label="Total Amount" paise={gst ? t.taxablePaise : t.taxablePaise + t.reimbursementsPaise} />
          {gst &&
            (intra ? (
              <>
                <TotalRow label={`CGST @ ${inv.gstRateBp / 200}%`} paise={t.cgstPaise} />
                <TotalRow label={`SGST @ ${inv.gstRateBp / 200}%`} paise={t.sgstPaise} />
              </>
            ) : (
              <TotalRow label={`IGST @ ${inv.gstRateBp / 100}%`} paise={t.igstPaise} />
            ))}
          {gst && t.reimbursementsPaise !== 0 && <TotalRow label="Reimbursements" paise={t.reimbursementsPaise} />}
          {t.roundOffPaise !== 0 && <TotalRow label="Round off" paise={t.roundOffPaise} />}
          <div className="!mt-4 flex justify-between border-t border-slate-200 pt-4 text-base font-semibold">
            <dt>Total Invoice Value</dt>
            <dd>
              <Money paise={t.grandTotalPaise} />
            </dd>
          </div>
          <p className="text-xs text-slate-500">{inv.amountInWords}</p>
        </dl>
        {inv.notes && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Notes</div>
            <p className="whitespace-pre-line">{inv.notes}</p>
          </div>
        )}
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
  const dialog = useDialog();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountPaise = parseRupeesToPaise(amount);
    const tdsPaise = parseRupeesToPaise(tds || '0');
    if (amountPaise === null || amountPaise < 0) return setError('Enter a valid amount received.');
    if (tdsPaise === null || tdsPaise < 0) return setError('Enter a valid TDS amount.');
    if (amountPaise + tdsPaise === 0) return setError('Amount received and TDS cannot both be zero.');
    if (date > todayIST()) return setError('Payment date cannot be in the future.');
    const settled = amountPaise + tdsPaise;
    if (
      settled !== inv.totals.grandTotalPaise &&
      !(await dialog.confirm({
        title: 'Amount differs from the invoice total',
        message: `Amount + TDS is ₹${formatPaise(settled)} but the invoice total is ₹${formatPaise(inv.totals.grandTotalPaise)}. Mark as paid anyway?`,
        confirmText: 'Mark as paid',
      }))
    )
      return;
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
        <Field
          label="TDS deducted (₹)"
          hint={
            <span className="inline-flex items-center gap-1">
              If the client cut TDS <Tip label="What is TDS?">TDS (Tax Deducted at Source): the client pays you less and deposits that part with the Income Tax department in your PAN. Enter it here so the invoice counts as fully settled; it shows in your Form 26AS.</Tip>
            </span>
          }
        >
          <input inputMode="decimal" value={tds} onChange={(e) => setTds(e.target.value)} />
        </Field>
        <Field label="Reference (UTR / cheque no.)">
          <input maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
          <Button type="submit" busy={busy}>
            Save payment
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CancelPanel({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const dialog = useDialog();
  return (
    <Card title="Cancel invoice">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            reason.trim().length >= 3 &&
            (await dialog.confirm({ title: 'Cancel this invoice?', message: 'This cannot be undone. The invoice number stays reserved.', confirmText: 'Cancel invoice', cancelText: 'Keep invoice', danger: true }))
          )
            onSubmit(reason);
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

