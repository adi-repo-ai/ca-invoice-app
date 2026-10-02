import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActor } from '../auth';
import type { InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { todayIST } from '../lib/fy';
import { sendDocument, type Channel } from '../lib/send';
import type { MessageKind } from '../lib/messages';
import { useSettings } from '../settings-context';
import { DownloadIcon, EyeIcon, MailIcon, TrashIcon, WhatsAppIcon } from './icons';
import { Money, OverdueBadge, Spinner, StatusBadge } from './ui';

// Thin coloured stripe on the left of each row, by status (overdue = red).
const STRIPE: Record<string, string> = {
  DRAFT: 'border-l-slate-300',
  ISSUED: 'border-l-blue-500',
  PAID: 'border-l-green-500',
  CANCELLED: 'border-l-red-300',
};
const stripe = (r: InvoiceRow, today: string) => (r.status === 'ISSUED' && r.dueDate < today ? 'border-l-red-500' : STRIPE[r.status] ?? '');

type Busy = '' | 'view' | 'download' | Channel | 'remind-whatsapp' | 'remind-email';

/** Row actions: view / download / email / WhatsApp, plus a ⋯ menu (remind, duplicate, delete). */
function RowActions({
  row,
  pdf,
  onDelete,
  onNotice,
}: {
  row: InvoiceRow;
  pdf: boolean;
  onDelete?: (row: InvoiceRow) => void;
  onNotice?: (text: string, kind?: 'success' | 'error') => void;
}) {
  const { settings } = useSettings();
  const actor = useActor();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Busy>('');
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const numbered = row.status !== 'DRAFT';
  const hasPdf = pdf && numbered;
  const canSend = pdf && numbered && row.status !== 'CANCELLED';
  const canRemind = pdf && row.status === 'ISSUED';
  const notify = (text: string, kind: 'success' | 'error' = 'success') => (onNotice ? onNotice(text, kind) : alert(text));

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  async function pdfAction(kind: 'view' | 'download') {
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
      notify((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function send(channel: Channel, kind: MessageKind) {
    setMenu(false);
    setBusy(kind === 'reminder' ? (`remind-${channel}` as Busy) : channel);
    try {
      const res = await sendDocument({ db, actor, inv: row, settings, channel, kind });
      if (res) notify(`${row.number}: ${res.message}`);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  }

  const cls = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50';
  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';
  const hasMenu = canRemind || pdf || onDelete;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      {hasPdf && (
        <>
          <button type="button" className={cls} title="View PDF" aria-label={`View PDF of ${row.number}`} onClick={() => pdfAction('view')} disabled={!!busy}>
            {busy === 'view' ? <Spinner small /> : <EyeIcon size={16} />}
          </button>
          <button type="button" className={cls} title="Download PDF" aria-label={`Download PDF of ${row.number}`} onClick={() => pdfAction('download')} disabled={!!busy}>
            {busy === 'download' ? <Spinner small /> : <DownloadIcon size={16} />}
          </button>
        </>
      )}
      {canSend && (
        <>
          <button type="button" className={cls} title="Send by email" aria-label={`Email ${row.number}`} onClick={() => send('email', 'invoice')} disabled={!!busy}>
            {busy === 'email' ? <Spinner small /> : <MailIcon size={16} />}
          </button>
          <button
            type="button"
            className={`${cls} !text-green-700 hover:!border-green-600`}
            title="Send to WhatsApp"
            aria-label={`WhatsApp ${row.number}`}
            onClick={() => send('whatsapp', 'invoice')}
            disabled={!!busy}
          >
            {busy === 'whatsapp' ? <Spinner small /> : <WhatsAppIcon size={16} />}
          </button>
        </>
      )}
      {hasMenu && (
        <span className="relative" ref={menuRef}>
          <button type="button" className={cls} title="More actions" aria-label={`More actions for ${row.number ?? 'draft'}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {busy.startsWith('remind') ? <Spinner small /> : <span className="text-lg leading-none">⋯</span>}
          </button>
          {menu && (
            <span className="animate-fade-in absolute right-0 top-9 z-30 w-52 rounded-xl border border-slate-200 bg-surface p-1 text-left shadow-xl">
              {canRemind && (
                <>
                  <button type="button" className={item} onClick={() => send('whatsapp', 'reminder')}>
                    <WhatsAppIcon size={15} /> Remind on WhatsApp
                  </button>
                  <button type="button" className={item} onClick={() => send('email', 'reminder')}>
                    <MailIcon size={15} /> Remind by email
                  </button>
                </>
              )}
              {pdf && (
                <button type="button" className={item} onClick={() => navigate(`/invoices/new?from=${row.id}`)}>
                  <span className="w-[15px] text-center">⧉</span> Duplicate
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className={`${item} !text-red-600 hover:!bg-red-50`}
                  onClick={() => {
                    setMenu(false);
                    onDelete(row);
                  }}
                >
                  <TrashIcon size={15} /> Delete
                </button>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** Responsive invoice list: table on desktop, cards on phones. */
export function InvoiceTable({
  rows,
  showClient = true,
  pdfActions = false,
  hideAmounts = false,
  onDelete,
  canDelete = () => true,
  onNotice,
}: {
  rows: InvoiceRow[];
  showClient?: boolean;
  pdfActions?: boolean;
  hideAmounts?: boolean;
  /** Called for rows the user may delete; omit to hide delete buttons. */
  onDelete?: (row: InvoiceRow) => void;
  canDelete?: (row: InvoiceRow) => boolean;
  /** Where row actions report success / errors (defaults to an alert). */
  onNotice?: (text: string, kind?: 'success' | 'error') => void;
}) {
  const today = todayIST();
  const actions = pdfActions || Boolean(onDelete);
  const amount = (paise: number, className?: string) =>
    hideAmounts ? (
      <span className={`tracking-widest text-slate-400 ${className ?? ''}`} title="Amount hidden">
        ₹ ••••
      </span>
    ) : (
      <Money paise={paise} className={className} />
    );
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-slate-500">No invoices found.</p>;
  const rowActions = (r: InvoiceRow) => <RowActions row={r} pdf={pdfActions} onDelete={onDelete && canDelete(r) ? onDelete : undefined} onNotice={onNotice} />;
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="py-2 pl-3">Number</th>
            <th>Date</th>
            {showClient && <th>Client</th>}
            <th>Status</th>
            <th className="text-right">Total</th>
            {actions && <th className="w-56 pr-1 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="transition hover:bg-slate-50">
              <td className={`border-l-4 py-2.5 pl-3 ${stripe(r, today)}`}>
                <Link className="font-medium text-[var(--brand)] hover:underline" to={`/invoices/${r.id}`}>
                  {r.number ?? 'Draft'}
                </Link>
              </td>
              <td>{r.invoiceDate}</td>
              {showClient && <td className="max-w-56 truncate">{r.client.name}</td>}
              <td>
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={r.status} />
                  <OverdueBadge dueDate={r.dueDate} today={today} status={r.status} />
                </span>
              </td>
              <td className="text-right">{amount(r.totals.grandTotalPaise)}</td>
              {actions && <td className="py-1.5 pr-1 text-right">{rowActions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className={`border-l-4 pl-3 ${stripe(r, today)}`}>
            <Link to={`/invoices/${r.id}`} className="flex items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <div className="font-medium">{r.number ?? 'Draft'}</div>
                <div className="truncate text-xs text-slate-500">
                  {r.invoiceDate}
                  {showClient && ` · ${r.client.name}`}
                </div>
                <OverdueBadge dueDate={r.dueDate} today={today} status={r.status} />
              </div>
              <div className="text-right">
                {amount(r.totals.grandTotalPaise, 'block text-sm font-medium')}
                <StatusBadge status={r.status} />
              </div>
            </Link>
            {actions && <div className="-mt-1 pb-3">{rowActions(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
