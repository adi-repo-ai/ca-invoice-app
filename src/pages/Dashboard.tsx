import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, LinkButton, Loading, Money, PageHeader, errorMessage } from '../components/ui';
import { listOverdue, periodTotals, type InvoiceRow, type PeriodTotals } from '../data/invoices';
import { db } from '../firebase';
import { fyForDate, fyRange, monthRange, todayIST } from '../lib/fy';
import { useSettings } from '../settings-context';

// Cost per load: 6 aggregation queries (~1 read each per 1,000 invoices)
// + up to 20 reads for the overdue list.
export default function Dashboard() {
  const { saved } = useSettings();
  const today = todayIST();
  const fy = fyForDate(today);
  const [month, setMonth] = useState<PeriodTotals | null>(null);
  const [year, setYear] = useState<PeriodTotals | null>(null);
  const [overdue, setOverdue] = useState<InvoiceRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const m = monthRange(today);
    const y = fyRange(fy);
    Promise.all([periodTotals(db, m.start, m.end), periodTotals(db, y.start, y.end), listOverdue(db, today)])
      .then(([a, b, c]) => {
        setMonth(a);
        setYear(b);
        setOverdue(c);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [today, fy]);

  const monthName = new Date(`${today}T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" actions={<LinkButton to="/invoices/new">New invoice</LinkButton>} />
      {!saved && <Alert kind="info">Firm settings have not been saved yet — an administrator should complete them under Settings.</Alert>}
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Totals title={monthName} t={month} />
        <Totals title={`Financial year ${fy}`} t={year} />
      </div>
      <Card title="Overdue invoices">
        {!overdue ? (
          <Loading />
        ) : overdue.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing overdue. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overdue.map((r) => (
              <li key={r.id}>
                <Link to={`/invoices/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-slate-50">
                  <div>
                    <div className="font-medium">{r.number}</div>
                    <div className="text-xs text-slate-500">
                      {r.client.name} · due {r.dueDate}
                    </div>
                  </div>
                  <Money paise={r.totals.grandTotalPaise} className="font-medium text-red-700" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Totals({ title, t }: { title: string; t: PeriodTotals | null }) {
  return (
    <Card title={title}>
      {!t ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Invoiced', t.invoicedPaise, 'text-slate-900'],
              ['Received', t.receivedPaise, 'text-green-700'],
              ['Outstanding', t.outstandingPaise, 'text-amber-700'],
            ] as const
          ).map(([label, v, cls]) => (
            <div key={label} className="rounded-md bg-slate-50 p-2 sm:p-3">
              <div className="text-xs text-slate-500">{label}</div>
              <Money paise={v} className={`block text-sm font-semibold sm:text-lg ${cls}`} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
