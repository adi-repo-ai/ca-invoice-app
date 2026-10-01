import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { InvoiceRow } from '../data/invoices';
import { useSettings } from '../settings-context';
import { DownloadIcon, EyeIcon } from './icons';
import { Money, Spinner, StatusBadge } from './ui';

/** View / download icons for an issued (numbered) invoice. Drafts open the invoice page instead. */
function PdfActions({ row }: { row: InvoiceRow }) {
  const { settings } = useSettings();
  const [busy, setBusy] = useState<'' | 'view' | 'download'>('');
  if (row.status === 'DRAFT') return null;
  async function run(kind: 'view' | 'download') {
    const win = kind === 'view' ? window.open('', '_blank') : null;
    setBusy(kind);
    try {
      const { generateInvoicePdf, downloadBlob } = await import('../pdf/generate');
      const { blob, fileName } = await generateInvoicePdf(row, settings);
      if (win) {
        const url = URL.createObjectURL(blob);
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else downloadBlob(blob, fileName);
    } catch (e) {
      win?.close();
      alert((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const cls = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-[var(--brand)] hover:text-[var(--brand)]';
  return (
    <span className="inline-flex gap-1.5">
      <button type="button" className={cls} title="View PDF" aria-label={`View PDF of ${row.number}`} onClick={() => run('view')} disabled={!!busy}>
        {busy === 'view' ? <Spinner small /> : <EyeIcon size={16} />}
      </button>
      <button type="button" className={cls} title="Download PDF" aria-label={`Download PDF of ${row.number}`} onClick={() => run('download')} disabled={!!busy}>
        {busy === 'download' ? <Spinner small /> : <DownloadIcon size={16} />}
      </button>
    </span>
  );
}

/** Responsive invoice list: table on desktop, cards on phones. */
export function InvoiceTable({ rows, showClient = true, pdfActions = false }: { rows: InvoiceRow[]; showClient?: boolean; pdfActions?: boolean }) {
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
            {pdfActions && <th className="w-24 text-right">PDF</th>}
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
              {pdfActions && (
                <td className="py-1.5 text-right">
                  <PdfActions row={r} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <Link to={`/invoices/${r.id}`} className="flex flex-1 items-center justify-between gap-2 py-3">
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
            {pdfActions && <PdfActions row={r} />}
          </li>
        ))}
      </ul>
    </>
  );
}
