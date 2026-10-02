import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Ring, StackBar, shortRupees } from '../components/Charts';
import { Alert, Button, Card, Empty, Money, PageHeader, Skeleton, Stat, errorMessage } from '../components/ui';
import { listAllInvoices, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { paiseToDecimal, toCsv } from '../lib/csv';
import { fyForDate, fyRange, todayIST } from '../lib/fy';
import { buildReport, type ClientSum } from '../lib/report';

export default function Reports() {
  const today = todayIST();
  const currentFy = fyForDate(today);
  const startYear = Number(currentFy.slice(0, 4));
  const fys = [0, 1, 2].map((n) => `${startYear - n}-${String((startYear - n + 1) % 100).padStart(2, '0')}`);
  const [fy, setFy] = useState(currentFy);
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    const { start, end } = fyRange(fy);
    listAllInvoices(db, { from: start, to: end })
      .then(setRows)
      .catch((e) => setError(errorMessage(e)));
  }, [fy]);

  const r = useMemo(() => (rows ? buildReport(rows, today) : null), [rows, today]);

  async function exportCsv() {
    if (!r) return;
    const csv = [
      toCsv(
        ['Month', 'Billed', 'Received'],
        r.months.map((m) => [m.label, paiseToDecimal(m.a), paiseToDecimal(m.b)]),
      ),
      '',
      toCsv(
        ['Client', 'Invoices', 'Billed', 'Received', 'Outstanding'],
        [...r.top, ...r.owing.filter((o) => !r.top.includes(o))].map((c) => [c.name, c.count, paiseToDecimal(c.billed), paiseToDecimal(c.received), paiseToDecimal(c.outstanding)]),
      ),
    ].join('\r\n');
    const { downloadBlob } = await import('../pdf/generate');
    downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `report_FY${fy}.csv`);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle={`Financial year ${fy} (April–March) · invoices dated in this year`}
        actions={
          <>
            <select value={fy} onChange={(e) => setFy(e.target.value)} aria-label="Financial year" className="w-36">
              {fys.map((f) => (
                <option key={f} value={f}>
                  FY {f}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={exportCsv} disabled={!r}>
              Export CSV
            </Button>
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      {!r ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
          <Skeleton className="h-64 sm:col-span-2 lg:col-span-4" />
        </div>
      ) : r.count === 0 ? (
        <Card>
          <Empty icon={<span className="text-xl">📊</span>}>No issued invoices in FY {fy} yet. Reports fill in as you create invoices.</Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Billed" value={<Money paise={r.billed} />} hint={`${r.count} invoices · ${r.clientCount} clients`} />
            <Stat label="Received" value={<Money paise={r.received} />} tone="good" hint={r.avgDays !== null ? `Paid in ${r.avgDays} days on average` : undefined} />
            <Stat label="Outstanding" value={<Money paise={r.outstanding} />} tone="warn" hint={`${r.owing.length} clients owe`} />
            <Stat label="Cancelled / drafts" value={`${r.cancelled} / ${r.drafts}`} hint={r.tax ? `GST collected ₹${shortRupees(r.tax)}` : 'No GST charged'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Billed vs received by month" className="lg:col-span-2">
              <BarChart data={r.months} aLabel="Billed" bLabel="Received" height={200} />
            </Card>
            <Card title="Collection rate">
              <div className="flex flex-col items-center gap-3">
                <Ring pct={r.rate} size={150} stroke={14} color="#16a34a">
                  <span className="text-3xl font-semibold tabular-nums">{r.rate}%</span>
                  <span className="text-xs text-slate-500">collected</span>
                </Ring>
                <p className="text-center text-sm text-slate-600">
                  <Money paise={r.received} /> of <Money paise={r.billed} />
                </p>
              </div>
            </Card>
          </div>

          <Card title="Outstanding by age">
            <StackBar
              parts={[
                { label: 'Not yet due', value: r.ageing.notDue, cls: 'bg-blue-400' },
                { label: '1–30 days late', value: r.ageing.d30, cls: 'bg-amber-400' },
                { label: '31–60 days late', value: r.ageing.d60, cls: 'bg-orange-500' },
                { label: '60+ days late', value: r.ageing.d90 + r.ageing.d90p, cls: 'bg-red-500' },
              ]}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Top clients by billing">
              <ClientTable rows={r.top} total={r.billed} />
            </Card>
            <Card title="Who owes you">
              {r.owing.length === 0 ? <Empty>Everyone has paid. 🎉</Empty> : <ClientTable rows={r.owing.slice(0, 10)} total={r.outstanding} owing />}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ClientTable({ rows, total, owing }: { rows: ClientSum[]; total: number; owing?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((c) => {
        const v = owing ? c.outstanding : c.billed;
        const pct = total ? Math.round((v / total) * 100) : 0;
        return (
          <li key={c.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              {c.clientId ? (
                <Link to={`/clients/${c.clientId}`} className="truncate font-medium hover:text-[var(--brand)] hover:underline">
                  {c.name}
                </Link>
              ) : (
                <span className="truncate font-medium">{c.name}</span>
              )}
              <Money paise={v} className={`shrink-0 font-semibold ${owing ? 'text-amber-700' : ''}`} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${owing ? 'bg-amber-500' : 'bg-[var(--brand)]'}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] text-slate-500">
                {c.count} inv · {pct}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
