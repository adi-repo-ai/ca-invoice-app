import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDialog } from '../components/Dialog';
import { DownloadIcon, MailIcon, WhatsAppIcon } from '../components/icons';
import { InvoiceTable } from '../components/InvoiceTable';
import { Alert, Button, Card, Field, LinkButton, Loading, Money, PageHeader, SkeletonRows, Stat, errorMessage } from '../components/ui';
import { deleteClient, getClient, type ClientRow } from '../data/clients';
import { listAllInvoices, listInvoices, clientSnapshot, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { fyForDate, fyRange, todayIST } from '../lib/fy';
import { formatPaise } from '../lib/money';
import { deliver, type Channel } from '../lib/send';
import { useAuth } from '../auth';
import { useSettings } from '../settings-context';

/** Billed / received / balance for numbered, non-cancelled invoices. */
function summarise(rows: InvoiceRow[]) {
  let billed = 0;
  let received = 0;
  for (const r of rows) {
    if (r.status !== 'ISSUED' && r.status !== 'PAID') continue;
    billed += r.totals.grandTotalPaise;
    if (r.payment) received += r.payment.amountPaise + r.payment.tdsPaise;
  }
  return { billed, received, balance: billed - received };
}

export default function ClientView() {
  const { id } = useParams();
  const { settings } = useSettings();
  const { role, pay } = useAuth();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const dialog = useDialog();

  const today = todayIST();
  const fy = fyRange(fyForDate(today));
  const [from, setFrom] = useState(fy.start);
  const [to, setTo] = useState(today);
  const [period, setPeriod] = useState<InvoiceRow[] | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!id) return;
    getClient(db, id)
      .then((c) => (c ? setClient(c) : setError('Client not found')))
      .catch((e) => setError(errorMessage(e)));
    listInvoices(db, { clientId: id }, null)
      .then((r) => {
        setRows(r.rows);
        setCursor(r.last);
        setHasMore(r.hasMore);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  // Invoices in the statement period (also drives the summary tiles).
  useEffect(() => {
    if (!id || !from || !to) return;
    setPeriod(null);
    listAllInvoices(db, { clientId: id, from, to })
      .then(setPeriod)
      .catch((e) => setError(errorMessage(e)));
  }, [id, from, to]);

  const sum = useMemo(() => summarise(period ?? []), [period]);

  async function more() {
    const r = await listInvoices(db, { clientId: id }, cursor);
    setRows((p) => [...(p ?? []), ...r.rows]);
    setCursor(r.last);
    setHasMore(r.hasMore);
  }

  async function statement(channel: Channel | 'download') {
    if (!client || !period) return;
    setBusy(channel);
    setError('');
    setNotice('');
    try {
      const { generateStatementPdf, downloadBlob } = await import('../pdf/generate');
      const invoices = period.filter((r) => r.status !== 'DRAFT').sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
      const file = await generateStatementPdf({ client: clientSnapshot(client), from, to, invoices, generatedOn: today }, settings);
      if (channel === 'download') {
        downloadBlob(file.blob, file.fileName);
        setNotice(`Statement downloaded: ${file.fileName}`);
        return;
      }
      const text = [
        `Dear ${client.contactPerson || client.name},`,
        `Please find attached your statement of account from ${from} to ${to}.`,
        `Balance due: Rs. ${formatPaise(sum.balance)}.`,
        settings.bank.upiId ? `Pay by UPI: ${settings.bank.upiId}` : '',
        `Thank you,`,
        settings.name,
      ]
        .filter(Boolean)
        .join('\n');
      const res = await deliver({ channel, email: client.email, whatsapp: client.whatsapp, subject: `Statement of account from ${settings.name}`, text, file });
      if (res) setNotice(res.method === 'share-sheet' ? 'Statement shared with the PDF attached.' : 'Statement PDF downloaded and your app opened with the message: attach the PDF and send.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  if (error && !client) return <Alert>{error}</Alert>;
  if (!client) return <Loading />;
  const line = (label: string, value: string) =>
    value ? (
      <div>
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="whitespace-pre-line text-sm">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={client.name}
        subtitle={
          client.tags && client.tags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {client.tags.map((t) => (
                <span key={t} className="rounded-full bg-[var(--brand)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--brand)]">
                  {t}
                </span>
              ))}
            </span>
          ) : undefined
        }
        actions={
          <>
            <LinkButton variant="secondary" to={`/clients/${client.id}/edit`}>
              Edit
            </LinkButton>
            <LinkButton to={`/invoices/new?client=${client.id}`}>New invoice</LinkButton>
            {role === 'ADMIN' && (
              <Button
                variant="danger"
                busy={deleting}
                onClick={async () => {
                  if (!(await dialog.confirm({ title: `Delete ${client.name}?`, message: 'They will be removed from your client list. Existing invoices are kept unchanged.', confirmText: 'Delete client', danger: true }))) return;
                  setDeleting(true);
                  try {
                    await deleteClient(db, client.id);
                    navigate('/clients', { replace: true });
                  } catch (e) {
                    setError(errorMessage(e));
                    setDeleting(false);
                  }
                }}
              >
                Delete client
              </Button>
            )}
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      <Card>
        <dl className="grid gap-3 sm:grid-cols-3">
          {line('Contact person', client.contactPerson)}
          {line('Email', client.email)}
          {line('Mobile number', client.whatsapp ? `+${client.whatsapp}` : '')}
          {line('State', client.stateName)}
          {line('GSTIN', client.gstin)}
          {line('PAN', client.pan)}
          {line('Billing address', client.address)}
        </dl>
        {client.notes && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Internal notes (never printed)</div>
            <p className="whitespace-pre-line">{client.notes}</p>
          </div>
        )}
      </Card>

      {pay && (
        <Card title="Statement of account">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Billed" value={period ? <Money paise={sum.billed} /> : '…'} />
            <Stat label="Received" value={period ? <Money paise={sum.received} /> : '…'} tone="good" />
            <Stat label="Balance due" value={period ? <Money paise={sum.balance} /> : '…'} tone={sum.balance > 0 ? 'warn' : 'good'} />
          </div>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-[10rem_10rem_1fr]">
            <Field label="From">
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="gap-2" busy={busy === 'download'} disabled={!period} onClick={() => statement('download')}>
                <DownloadIcon size={16} /> Download
              </Button>
              <Button variant="secondary" className="gap-2 !border-green-600 !text-green-700" busy={busy === 'whatsapp'} disabled={!period} onClick={() => statement('whatsapp')}>
                <WhatsAppIcon size={16} /> WhatsApp
              </Button>
              <Button variant="secondary" className="gap-2" busy={busy === 'email'} disabled={!period} onClick={() => statement('email')}>
                <MailIcon size={16} /> Email
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">A PDF listing every invoice and payment in the period, with a running balance. Default: this financial year to date.</p>
        </Card>
      )}

      <Card title="Invoice history">
        {!rows ? (
          <SkeletonRows rows={3} />
        ) : (
          <InvoiceTable rows={rows} showClient={false} pdfActions onNotice={(t, k) => (k === 'error' ? setError(t) : setNotice(t))} />
        )}
        {hasMore && (
          <div className="mt-3 text-center">
            <Button variant="secondary" onClick={more}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
