import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ClientPicker } from '../components/ClientPicker';
import { InvoiceTable } from '../components/InvoiceTable';
import { EyeIcon } from '../components/icons';
import { Alert, Button, Card, Field, LinkButton, Loading, PageHeader, errorMessage } from '../components/ui';
import type { ClientRow } from '../data/clients';
import { countInvoices, listAllInvoices, listInvoices, type InvoiceFilter, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { paiseToDecimal, toCsv } from '../lib/csv';
import { todayIST } from '../lib/fy';
import type { InvoiceStatus } from '../lib/types';

export function invoicesToCsv(rows: InvoiceRow[]): string {
  return toCsv(
    ['Invoice number', 'Invoice date', 'Due date', 'Status', 'Client', 'Client GSTIN', 'Place of supply',
      'Taxable value', 'CGST', 'SGST', 'IGST', 'Reimbursements', 'Round off', 'Grand total',
      'Paid on', 'Amount received', 'TDS', 'Payment mode', 'Cancel reason'],
    rows.map((r) => [
      r.number ?? 'DRAFT', r.invoiceDate, r.dueDate, r.status, r.client.name, r.client.gstin,
      `${r.client.stateName} (${r.client.stateCode})`,
      paiseToDecimal(r.totals.taxablePaise), paiseToDecimal(r.totals.cgstPaise), paiseToDecimal(r.totals.sgstPaise),
      paiseToDecimal(r.totals.igstPaise), paiseToDecimal(r.totals.reimbursementsPaise), paiseToDecimal(r.totals.roundOffPaise),
      paiseToDecimal(r.totals.grandTotalPaise),
      r.payment?.date ?? '', r.payment ? paiseToDecimal(r.payment.amountPaise) : '',
      r.payment ? paiseToDecimal(r.payment.tdsPaise) : '', r.payment?.mode ?? '', r.cancelReason ?? '',
    ]),
  );
}

const TABS: { value: InvoiceStatus | ''; label: string; active: string }[] = [
  { value: '', label: 'All', active: 'bg-[var(--brand)] text-white border-[var(--brand)]' },
  { value: 'DRAFT', label: 'Draft', active: 'bg-slate-700 text-white border-slate-700' },
  { value: 'ISSUED', label: 'Issued', active: 'bg-blue-600 text-white border-blue-600' },
  { value: 'PAID', label: 'Paid', active: 'bg-green-600 text-white border-green-600' },
  { value: 'CANCELLED', label: 'Cancelled', active: 'bg-red-600 text-white border-red-600' },
];
const HISTORY_KEY = 'invoiceHistoryHidden';

export default function Invoices() {
  const [client, setClient] = useState<ClientRow | null>(null);
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HISTORY_KEY) === '1';
    } catch {
      return false;
    }
  });

  function toggleHistory() {
    setHidden((h) => {
      try {
        localStorage.setItem(HISTORY_KEY, h ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !h;
    });
  }

  const filter: InvoiceFilter = { clientId: client?.id, status, from: from || undefined, to: to || undefined };
  const key = JSON.stringify(filter);
  // Counts per status follow the client and date filters (not the status itself).
  const countKey = JSON.stringify({ clientId: client?.id, from: from || undefined, to: to || undefined });

  useEffect(() => {
    setRows(null);
    setError('');
    listInvoices(db, JSON.parse(key), null)
      .then((r) => {
        setRows(r.rows);
        setCursor(r.last);
        setHasMore(r.hasMore);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [key]);

  useEffect(() => {
    const base = JSON.parse(countKey) as InvoiceFilter;
    setCounts({});
    for (const t of TABS) {
      countInvoices(db, { ...base, status: t.value })
        .then((n) => setCounts((c) => ({ ...c, [t.value]: n })))
        .catch(() => setCounts((c) => ({ ...c, [t.value]: null })));
    }
  }, [countKey]);

  async function more() {
    setBusy('more');
    try {
      const r = await listInvoices(db, filter, cursor);
      setRows((p) => [...(p ?? []), ...r.rows]);
      setCursor(r.last);
      setHasMore(r.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function exportCsv() {
    setBusy('csv');
    try {
      const all = await listAllInvoices(db, filter);
      const blob = new Blob(['\ufeff' + invoicesToCsv(all)], { type: 'text/csv;charset=utf-8' });
      const { downloadBlob } = await import('../pdf/generate');
      downloadBlob(blob, `invoices_${todayIST()}.csv`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  const extraFilters = Boolean(client || from || to);
  const shown = counts[status];
  const label = TABS.find((t) => t.value === status)!.label;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        subtitle={
          counts[''] == null ? (
            'Your invoice history'
          ) : (
            <span className="inline-flex items-center gap-2">
              Total invoices
              <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-sm font-semibold text-white">{counts['']}</span>
            </span>
          )
        }
        actions={<LinkButton to="/invoices/new">+ New invoice</LinkButton>}
      />
      {error && <Alert>{error}</Alert>}
      <Card>
        {/* Status tabs: always visible, with counts */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
          {TABS.map((t) => {
            const active = status === t.value;
            const n = counts[t.value];
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(t.value)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition ${active ? t.active : 'border-slate-200 bg-surface text-slate-700 hover:border-[var(--brand)] hover:text-[var(--brand)]'}`}
              >
                {t.label}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {n === undefined ? '…' : n === null ? '–' : n}
                </span>
              </button>
            );
          })}
        </div>

        {/* Client and date filters: always visible */}
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="Client" className="lg:col-span-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ClientPicker value={client} onChange={setClient} />
              </div>
              {client && (
                <Button variant="ghost" onClick={() => setClient(null)}>
                  Clear
                </Button>
              )}
            </div>
          </Field>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            {extraFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setClient(null);
                  setFrom('');
                  setTo('');
                }}
              >
                Reset
              </Button>
            )}
            <Button variant="secondary" className="flex-1" busy={busy === 'csv'} onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        </div>

        {/* History header with show / hide */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <h2 className="text-base font-semibold">
            {label === 'All' ? 'All invoices' : `${label} invoices`}
            {shown != null && <span className="ml-2 text-sm font-normal text-slate-500">({shown})</span>}
          </h2>
          <Button variant="secondary" className="gap-2" onClick={toggleHistory} aria-expanded={!hidden}>
            <EyeIcon size={16} />
            {hidden ? 'Show history' : 'Hide history'}
          </Button>
        </div>
        {hidden ? (
          <p className="py-6 text-center text-sm text-slate-500">Invoice history is hidden. Click “Show history” to see it.</p>
        ) : (
          <div className="mt-2">
            {!rows ? <Loading /> : <InvoiceTable rows={rows} pdfActions />}
            {hasMore && (
              <div className="mt-3 text-center">
                <Button variant="secondary" busy={busy === 'more'} onClick={more}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
