import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ClientPicker } from '../components/ClientPicker';
import { InvoiceTable } from '../components/InvoiceTable';
import { useAuth, useActor } from '../auth';
import { useDialog } from '../components/Dialog';
import { EyeIcon, EyeOffIcon, TrashIcon } from '../components/icons';
import { Alert, Button, Card, Field, LinkButton, PageHeader, SkeletonRows, errorMessage } from '../components/ui';
import type { ClientRow } from '../data/clients';
import { countInvoices, deleteInvoices, listAllInvoices, listInvoices, type InvoiceFilter, type InvoiceRow } from '../data/invoices';
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
const AMOUNTS_KEY = 'invoiceAmountsHidden';

export default function Invoices() {
  const { role } = useAuth();
  const actor = useActor();
  const dialog = useDialog();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [busy, setBusy] = useState('');
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(AMOUNTS_KEY) === '1';
    } catch {
      return false;
    }
  });

  function toggleAmounts() {
    setHidden((h) => {
      try {
        localStorage.setItem(AMOUNTS_KEY, h ? '0' : '1');
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
  }, [key, reloadTick]);

  useEffect(() => {
    const base = JSON.parse(countKey) as InvoiceFilter;
    setCounts({});
    for (const t of TABS) {
      countInvoices(db, { ...base, status: t.value })
        .then((n) => setCounts((c) => ({ ...c, [t.value]: n })))
        .catch(() => setCounts((c) => ({ ...c, [t.value]: null })));
    }
  }, [countKey, reloadTick]);

  const isAdmin = role === 'ADMIN';
  const canDelete = (r: InvoiceRow) => isAdmin || r.status === 'DRAFT';
  const numbered = (n: number) => (n === 1 ? '1 invoice' : `${n} invoices`);

  async function removeOne(r: InvoiceRow) {
    const ok = await dialog.confirm({
      title: `Delete ${r.number ?? 'this draft'}?`,
      message:
        r.status === 'DRAFT'
          ? `The draft for ${r.client.name} will be permanently deleted.`
          : `Invoice ${r.number} for ${r.client.name} will be permanently deleted. Its number will not be reused. This cannot be undone.`,
      confirmText: 'Delete invoice',
      danger: true,
    });
    if (!ok) return;
    setBusy('delete');
    setError('');
    try {
      await deleteInvoices(db, actor, [r]);
      setNotice(`${r.number ?? 'Draft'} deleted.`);
      setReloadTick((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function removeAll() {
    setBusy('deleteAll');
    setError('');
    try {
      const all = (await listAllInvoices(db, filter)).filter(canDelete);
      if (all.length === 0) {
        setNotice('Nothing to delete.');
        return;
      }
      const typed = await dialog.prompt({
        title: `Delete ${numbered(all.length)}?`,
        message: `This permanently deletes ${numbered(all.length)} shown by the current selection${status ? ` (${label})` : ''}${extraFilters ? ' and filters' : ''}. Invoice numbers are not reused. This cannot be undone. Type DELETE to confirm.`,
        label: 'Type DELETE',
        confirmText: 'Delete all',
        danger: true,
      });
      if (typed?.trim().toUpperCase() !== 'DELETE') {
        if (typed !== null) setError('Not deleted: you must type DELETE to confirm.');
        return;
      }
      await deleteInvoices(db, actor, all);
      setNotice(`${numbered(all.length)} deleted.`);
      setReloadTick((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

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
      {notice && <Alert kind="success">{notice}</Alert>}
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

        {/* List header: hide amounts, delete all */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <h2 className="text-base font-semibold">
            {label === 'All' ? 'All invoices' : `${label} invoices`}
            {shown != null && <span className="ml-2 text-sm font-normal text-slate-500">({shown})</span>}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2" onClick={toggleAmounts} aria-pressed={hidden}>
              {hidden ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
              {hidden ? 'Show amounts' : 'Hide amounts'}
            </Button>
            {(isAdmin || status === 'DRAFT') && (shown ?? 0) > 0 && (
              <Button variant="secondary" className="gap-2 !border-red-300 !text-red-600 hover:!bg-red-50" busy={busy === 'deleteAll'} onClick={removeAll}>
                <TrashIcon size={16} />
                {status ? `Delete all ${label.toLowerCase()}` : 'Delete all'}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2">
          {!rows ? (
            <SkeletonRows />
          ) : (
            <InvoiceTable
              rows={rows}
              pdfActions
              hideAmounts={hidden}
              onDelete={removeOne}
              canDelete={canDelete}
              onNotice={(text, kind) => (kind === 'error' ? (setError(text), setNotice('')) : (setNotice(text), setError('')))}
            />
          )}
          {hasMore && (
            <div className="mt-3 text-center">
              <Button variant="secondary" busy={busy === 'more'} onClick={more}>
                Load more
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
