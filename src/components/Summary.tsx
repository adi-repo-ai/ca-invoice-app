import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listOverdue, periodTotals, type InvoiceRow, type PeriodTotals } from '../data/invoices';
import { db } from '../firebase';
import { fyForDate, fyRange, monthRange, todayIST } from '../lib/fy';
import { Money } from './ui';

// Compact totals shown at the top of the Invoices page.
// Cost per load: 6 server-side sum() aggregations + up to 10 reads for overdue.
export function Summary() {
  const today = todayIST();
  const fy = fyForDate(today);
  const [month, setMonth] = useState<PeriodTotals | null>(null);
  const [year, setYear] = useState<PeriodTotals | null>(null);
  const [overdue, setOverdue] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    const m = monthRange(today);
    const y = fyRange(fy);
    Promise.all([periodTotals(db, m.start, m.end), periodTotals(db, y.start, y.end), listOverdue(db, today, 10)])
      .then(([a, b, c]) => {
        setMonth(a);
        setYear(b);
        setOverdue(c);
      })
      .catch(() => {
        /* totals are optional; the invoice list below still works */
      });
  }, [today, fy]);

  const monthName = new Date(`${today}T00:00:00`).toLocaleString('en-IN', { month: 'long' });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Totals title={`This month (${monthName})`} t={month} />
        <Totals title={`This year (FY ${fy})`} t={year} />
      </div>
      {overdue.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
          <div className="mb-1 font-medium text-red-800">Overdue ({overdue.length})</div>
          <ul className="space-y-1">
            {overdue.map((r) => (
              <li key={r.id}>
                <Link to={`/invoices/${r.id}`} className="flex justify-between gap-2 text-red-900 hover:underline">
                  <span className="truncate">
                    {r.number} · {r.client.name} · due {r.dueDate}
                  </span>
                  <Money paise={r.totals.grandTotalPaise} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Totals({ title, t }: { title: string; t: PeriodTotals | null }) {
  const cells = [
    ['Invoiced', t?.invoicedPaise, 'text-slate-900'],
    ['Received', t?.receivedPaise, 'text-green-700'],
    ['Pending', t?.outstandingPaise, 'text-amber-700'],
  ] as const;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 text-xs font-medium uppercase text-slate-500">{title}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {cells.map(([label, v, cls]) => (
          <div key={label}>
            <div className="text-xs text-slate-500">{label}</div>
            {v === undefined ? <div className="text-sm text-slate-300">…</div> : <Money paise={v} className={`block text-sm font-semibold sm:text-base ${cls}`} />}
          </div>
        ))}
      </div>
    </div>
  );
}
