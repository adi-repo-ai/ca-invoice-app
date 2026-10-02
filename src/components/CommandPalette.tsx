import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { listClients, type ClientRow } from '../data/clients';
import { findInvoiceByNumber, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { formatInvoiceNumber, fyForDate, todayIST } from '../lib/fy';
import { formatPaise } from '../lib/money';
import { useSettings } from '../settings-context';

interface Item {
  key: string;
  label: ReactNode;
  hint?: string;
  group: string;
  go: () => void;
}

/** Ctrl+K / "/" search: jump to a client, an invoice number or any page. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { role, fin } = useAuth();
  const { settings } = useSettings();
  const [q, setQ] = useState('');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Debounced lookups: client name prefix, and invoice number ("7", "0007" or the full number).
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(async () => {
      if (!term) {
        setClients([]);
        setInvoice(null);
        return;
      }
      listClients(db, term, null)
        .then((r) => setClients(r.rows.slice(0, 5)))
        .catch(() => setClients([]));
      const digits = /^\d{1,4}$/.test(term) ? Number(term) : null;
      const number = digits ? formatInvoiceNumber(settings.invoicePrefix, fyForDate(todayIST()), digits) : term.toUpperCase().includes('/') ? term.toUpperCase() : null;
      setInvoice(number ? await findInvoiceByNumber(db, number).catch(() => null) : null);
    }, 200);
    return () => clearTimeout(t);
  }, [q, settings.invoicePrefix]);

  const go = (path: string) => () => {
    onClose();
    navigate(path);
  };
  const pages: Item[] = [
    { key: 'new-inv', group: 'Actions', label: '＋ New invoice', hint: 'N', go: go('/invoices/new') },
    { key: 'new-cli', group: 'Actions', label: '＋ New client', hint: 'C', go: go('/clients/new') },
    { key: 'home', group: 'Pages', label: 'Home', go: go('/') },
    { key: 'inv', group: 'Pages', label: 'Invoices', go: go('/invoices') },
    { key: 'cli', group: 'Pages', label: 'Clients', go: go('/clients') },
    ...(fin ? [{ key: 'rep', group: 'Pages', label: 'Reports', go: go('/reports') }] : []),
    ...(role === 'ADMIN'
      ? [
          { key: 'set', group: 'Pages', label: 'Settings', go: go('/settings') },
          { key: 'usr', group: 'Pages', label: 'Users', go: go('/settings/users') },
          { key: 'act', group: 'Pages', label: 'Activity log', go: go('/settings/activity') },
          ...(fin ? [{ key: 'bak', group: 'Pages', label: 'Backup', go: go('/settings/backup') }] : []),
        ]
      : []),
  ];
  const term = q.trim().toLowerCase();
  const items: Item[] = useMemo(
    () => [
      ...(invoice
        ? [
            {
              key: `i-${invoice.id}`,
              group: 'Invoice',
              label: (
                <>
                  <span className="font-medium">{invoice.number}</span> · {invoice.client.name}
                </>
              ),
              hint: `₹${formatPaise(invoice.totals.grandTotalPaise)} · ${invoice.status}`,
              go: go(`/invoices/${invoice.id}`),
            },
          ]
        : []),
      ...clients.map((c) => ({ key: `c-${c.id}`, group: 'Clients', label: c.name, hint: c.stateName, go: go(`/clients/${c.id}`) })),
      ...pages.filter((p) => !term || String(p.label).toLowerCase().includes(term)),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoice, clients, term, role, fin],
  );
  useEffect(() => setActive(0), [items.length]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.go();
    } else if (e.key === 'Escape') onClose();
  }

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search"
        className="animate-fade-in w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-400" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search clients, invoice number (e.g. 12), or pages…"
            className="min-w-0 flex-1 !border-0 !bg-transparent !px-0 !py-4 !shadow-none !ring-0 !outline-none focus:!border-0 focus:!shadow-none focus:!ring-0"
            aria-label="Search"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-300 px-1.5 text-[10px] text-slate-500 sm:block">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-2" role="listbox">
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No matches.</li>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <li key={it.key}>
                {header && <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{it.group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.go}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === active ? 'bg-[var(--brand)]/10 text-[var(--brand)]' : 'text-slate-700'}`}
                >
                  <span className="truncate">{it.label}</span>
                  {it.hint && <span className="shrink-0 text-xs text-slate-500">{it.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-4 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>? for shortcuts</span>
        </div>
      </div>
    </div>
  );
}
