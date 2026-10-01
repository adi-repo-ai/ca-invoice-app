import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ClientPicker } from '../components/ClientPicker';
import { Summary } from '../components/Summary';
import { InvoiceTable } from '../components/InvoiceTable';
import { Alert, Button, Card, Field, LinkButton, Loading, PageHeader, errorMessage } from '../components/ui';
import type { ClientRow } from '../data/clients';
import { listAllInvoices, listInvoices, type InvoiceFilter, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { paiseToDecimal, toCsv } from '../lib/csv';
import { todayIST } from '../lib/fy';
import type { InvoiceStatus } from '../lib/types';

const STATUSES: InvoiceStatus[] = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];

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

export default function Invoices() {
  const [client, setClient] = useState<ClientRow | null>(null);
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filter: InvoiceFilter = { clientId: client?.id, status, from: from || undefined, to: to || undefined };
  const key = JSON.stringify(filter);

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
      const blob = new Blob(['﻿' + invoicesToCsv(all)], { type: 'text/csv;charset=utf-8' });
      const { downloadBlob } = await import('../pdf/generate');
      downloadBlob(blob, `invoices_${todayIST()}.csv`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  const filtering = Boolean(client || status || from || to);
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" actions={<LinkButton to="/invoices/new">+ New invoice</LinkButton>} />
      <Summary />
      {error && <Alert>{error}</Alert>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? 'Hide filters' : `Filter${filtering ? ' (on)' : ''}`}
          </Button>
          <Button variant="ghost" busy={busy === 'csv'} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
        {showFilters && (
          <div className="mb-4 grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
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
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus | '')}>
                <option value="">All</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="From">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}
        {!rows ? <Loading /> : <InvoiceTable rows={rows} />}
        {hasMore && (
          <div className="mt-3 text-center">
            <Button variant="secondary" busy={busy === 'more'} onClick={more}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
