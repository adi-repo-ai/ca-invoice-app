import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { listHome, type HomeItem } from '../data/home';
import { listOldDrafts, listOverdue, type InvoiceRow } from '../data/invoices';
import { db } from '../firebase';
import { addDays, todayIST } from '../lib/fy';
import { formatPaise } from '../lib/money';

interface Alerts {
  overdue: InvoiceRow[];
  tasks: HomeItem[];
  events: HomeItem[];
  drafts: InvoiceRow[];
}

/** Header bell: overdue invoices, tasks due, today's events and stale drafts. */
export function NotificationBell() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const today = todayIST();
    const [overdue, tasks, events, drafts] = await Promise.all([
      listOverdue(db, today, 10).catch(() => []),
      listHome(db, user.uid, 'tasks').catch(() => []),
      listHome(db, user.uid, 'events').catch(() => []),
      listOldDrafts(db, addDays(today, -7), 5).catch(() => []),
    ]);
    setAlerts({
      overdue,
      tasks: tasks.filter((t) => !t.done && (t.date ?? '') <= today),
      events: events.filter((e) => e.date === today),
      drafts,
    });
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const count = alerts ? alerts.overdue.length + alerts.tasks.length + alerts.events.length + alerts.drafts.length : 0;
  const section = 'px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500';
  const row = 'flex items-center justify-between gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50';
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
        className="relative rounded-lg p-2 text-white transition hover:bg-white/10"
        aria-label={`Notifications${count ? ` (${count})` : ''}`}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-[var(--brand)]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-surface text-slate-800 shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Notifications</div>
          <div className="max-h-[60vh] overflow-y-auto pb-2">
            {!alerts ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : count === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You're all caught up. ✨</p>
            ) : (
              <>
                {alerts.overdue.length > 0 && (
                  <>
                    <div className={section}>Overdue invoices</div>
                    {alerts.overdue.map((r) => (
                      <Link key={r.id} to={`/invoices/${r.id}`} className={row}>
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{r.number}</span> · {r.client.name}
                        </span>
                        <span className="shrink-0 font-medium text-red-600">₹{formatPaise(r.totals.grandTotalPaise)}</span>
                      </Link>
                    ))}
                  </>
                )}
                {alerts.tasks.length > 0 && (
                  <>
                    <div className={section}>Tasks due</div>
                    {alerts.tasks.map((t) => (
                      <Link key={t.id} to="/" className={row}>
                        <span className="truncate">☐ {t.title}</span>
                        <span className="shrink-0 text-xs text-slate-500">{t.date === todayIST() ? 'today' : t.date}</span>
                      </Link>
                    ))}
                  </>
                )}
                {alerts.events.length > 0 && (
                  <>
                    <div className={section}>Today</div>
                    {alerts.events.map((e) => (
                      <Link key={e.id} to="/" className={row}>
                        <span className="truncate">📅 {e.title}</span>
                        <span className="shrink-0 text-xs text-slate-500">{e.time || 'all day'}</span>
                      </Link>
                    ))}
                  </>
                )}
                {alerts.drafts.length > 0 && (
                  <>
                    <div className={section}>Drafts older than a week</div>
                    {alerts.drafts.map((r) => (
                      <Link key={r.id} to={`/invoices/${r.id}`} className={row}>
                        <span className="truncate">Draft · {r.client.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">{r.invoiceDate}</span>
                      </Link>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
