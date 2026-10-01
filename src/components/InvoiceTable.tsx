import { Link } from 'react-router-dom';
import type { InvoiceRow } from '../data/invoices';
import { Money, StatusBadge } from './ui';

/** Responsive invoice list: table on desktop, cards on phones. */
export function InvoiceTable({ rows, showClient = true }: { rows: InvoiceRow[]; showClient?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No invoices found.</p>;
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2">Number</th>
            <th>Date</th>
            {showClient && <th>Client</th>}
            <th>Status</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="py-2">
                <Link className="font-medium text-[var(--brand)] hover:underline" to={`/invoices/${r.id}`}>
                  {r.number ?? 'Draft'}
                </Link>
              </td>
              <td>{r.invoiceDate}</td>
              {showClient && <td>{r.client.name}</td>}
              <td>
                <StatusBadge status={r.status} />
              </td>
              <td className="text-right">
                <Money paise={r.totals.grandTotalPaise} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/invoices/${r.id}`} className="flex items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <div className="font-medium">{r.number ?? 'Draft'}</div>
                <div className="truncate text-xs text-slate-500">
                  {r.invoiceDate}
                  {showClient && ` · ${r.client.name}`}
                </div>
              </div>
              <div className="text-right">
                <Money paise={r.totals.grandTotalPaise} className="block text-sm font-medium" />
                <StatusBadge status={r.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
