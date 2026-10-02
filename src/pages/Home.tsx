import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { BarChart, Ring, shortRupees, type BarPoint } from '../components/Charts';
import { Button, Card, Empty, LinkButton, Money, OverdueBadge, Skeleton, SkeletonRows, Switch, errorMessage } from '../components/ui';
import { describeAudit, listRecentAudit, timeAgo, type AuditEntry } from '../data/audit';
import { countClients } from '../data/clients';
import { addHome, deleteHome, listHome, updateHome, type HomeItem, type HomeKind } from '../data/home';
import { countInvoices, countNumbered, listOldDrafts, listOverdue, periodTotals, type InvoiceRow, type PeriodTotals } from '../data/invoices';
import { db } from '../firebase';
import { addDays, fyForDate, fyRange, monthRange, todayIST } from '../lib/fy';
import { daysBetween } from '../lib/messages';
import { formatPaise } from '../lib/money';
import { useSettings } from '../settings-context';

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function useClock(): Date {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Personal items (tasks / events / notes / links) for the signed-in user. */
function useHomeItems(kind: HomeKind) {
  const { user } = useAuth();
  const [items, setItems] = useState<HomeItem[] | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      setItems(await listHome(db, user!.uid, kind));
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    }
  }, [user, kind]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { items, error, reload, uid: user!.uid };
}

const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const MONEY_MILESTONES = [100000_00, 500000_00, 1000000_00, 2500000_00, 5000000_00, 10000000_00];

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function setFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* ignore */
  }
}

/** Last N calendar months (oldest first) as { label, start, end }. */
function lastMonths(today: string, n: number) {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    const iso = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), ...monthRange(iso) };
  });
}

export default function Home() {
  const { user, role, fin } = useAuth();
  const { settings, saved } = useSettings();
  const [unpaid, setUnpaid] = useState<number | null>(null);
  const now = useClock();
  const today = todayIST();
  const fy = fyForDate(today);
  const [month, setMonth] = useState<PeriodTotals | null>(null);
  const [year, setYear] = useState<PeriodTotals | null>(null);
  const [week, setWeek] = useState<PeriodTotals | null>(null);
  const [series, setSeries] = useState<BarPoint[] | null>(null);
  const [clients, setClients] = useState<number | null>(null);
  const [numbered, setNumbered] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<InvoiceRow[] | null>(null);
  const [drafts, setDrafts] = useState<InvoiceRow[]>([]);
  const [activity, setActivity] = useState<AuditEntry[] | null>(null);
  const [dueTasks, setDueTasks] = useState<number | null>(null);
  const [todayEvents, setTodayEvents] = useState<HomeItem[]>([]);
  const [, bump] = useState(0);

  useEffect(() => {
    const m = monthRange(today);
    const y = fyRange(fy);
    // Revenue totals are only loaded for people with revenue access.
    if (fin) {
      periodTotals(db, m.start, m.end).then(setMonth).catch(() => undefined);
      periodTotals(db, y.start, y.end).then(setYear).catch(() => undefined);
      periodTotals(db, addDays(today, -6), today).then(setWeek).catch(() => undefined);
      Promise.all(lastMonths(today, 6).map(async (mo) => ({ mo, t: await periodTotals(db, mo.start, mo.end) })))
        .then((rows) => setSeries(rows.map(({ mo, t }) => ({ label: mo.label, a: t.invoicedPaise, b: t.receivedPaise }))))
        .catch(() => setSeries([]));
    } else {
      countInvoices(db, { status: 'ISSUED' }).then(setUnpaid).catch(() => undefined);
    }
    countClients(db).then(setClients).catch(() => undefined);
    countNumbered(db).then(setNumbered).catch(() => undefined);
    listOverdue(db, today, 50).then(setOverdue).catch(() => setOverdue([]));
    listOldDrafts(db, addDays(today, -7), 3).then(setDrafts).catch(() => undefined);
    listRecentAudit(db, 8)
      .then((r) => setActivity(r.rows))
      .catch(() => setActivity([]));
    if (user) {
      listHome(db, user.uid, 'tasks')
        .then((t) => setDueTasks(t.filter((x) => !x.done && (x.date ?? '') <= today).length))
        .catch(() => setDueTasks(0));
      listHome(db, user.uid, 'events')
        .then((e) => setTodayEvents(e.filter((x) => x.date === today)))
        .catch(() => undefined);
    }
  }, [today, fy, user, fin]);

  const name = (user?.displayName || user?.email?.split('@')[0] || '').trim();
  const collected = year && year.invoicedPaise > 0 ? Math.min(100, Math.round((year.receivedPaise / year.invoicedPaise) * 100)) : 0;
  const overdueSum = (overdue ?? []).reduce((t, r) => t + r.totals.grandTotalPaise, 0);
  const goal = settings.monthlyGoalPaise;
  const goalPct = goal && month ? Math.round((month.receivedPaise / goal) * 100) : 0;

  // Getting started: shown until everything is done (or dismissed).
  const steps = [
    { done: saved, label: 'Check and save your firm details', to: '/settings', admin: true },
    { done: Boolean(settings.bank.upiId || settings.bank.accountNumber), label: 'Add bank / UPI details (adds a "Scan to pay" QR)', to: '/settings', admin: true },
    { done: Boolean(settings.signatureDataUrl), label: 'Upload your signature', to: '/settings', admin: true },
    { done: (clients ?? 0) > 0, label: 'Add your first client', to: '/clients/new', admin: false },
    { done: (numbered ?? 0) > 0, label: 'Create and send your first invoice', to: '/invoices/new', admin: false },
  ].filter((st) => role === 'ADMIN' || !st.admin);
  const stepsDone = steps.filter((st) => st.done).length;
  const showSetup = clients !== null && numbered !== null && stepsDone < steps.length && !readFlag('setupDismissed');

  // Milestones: highest reached, until dismissed.
  const countMilestone = numbered ? [...MILESTONES].reverse().find((m) => numbered >= m) : undefined;
  const moneyMilestone = fin && year ? [...MONEY_MILESTONES].reverse().find((m) => year.receivedPaise >= m) : undefined;
  const milestone = moneyMilestone
    ? { text: `₹${shortRupees(moneyMilestone)} collected in FY ${fy}!`, sub: 'A big step for the firm. Keep it going.' }
    : countMilestone && countMilestone > 1
      ? { text: `${countMilestone} invoices issued!`, sub: 'Every one numbered, logged and backed by the audit trail.' }
      : null;
  const milestoneHidden = readFlag('milestoneHidden');
  const toggleMilestone = (show: boolean) => {
    try {
      localStorage.setItem('milestoneHidden', show ? '0' : '1');
    } catch {
      /* ignore */
    }
    bump((n) => n + 1);
  };

  const nudges: { text: ReactNode; to: string }[] = [
    ...drafts.map((d) => ({ text: <>Draft for <b>{d.client.name}</b> is over a week old: finish or delete it?</>, to: `/invoices/${d.id}` })),
    ...(overdue ?? [])
      .filter((r) => daysBetween(r.dueDate, today) > 30)
      .slice(0, 2)
      .map((r) => ({ text: <><b>{r.client.name}</b> is {daysBetween(r.dueDate, today)} days late on {r.number}: send a reminder?</>, to: `/invoices/${r.id}` })),
  ];

  return (
    <div className="space-y-6">
      {/* Welcome + date/time + quick actions */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--brand)] to-[#083f66] p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-white/80">
              {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })} ·{' '}
              <span className="tabular-nums">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting()}
              {name ? `, ${name}` : ''} 👋
            </h1>
            <p className="mt-1 text-sm text-white/85">
              {fin && week && week.receivedPaise > 0 ? (
                <>
                  You collected <b>₹{formatPaise(week.receivedPaise)}</b> in the last 7 days 👏
                </>
              ) : (
                "Here's what's happening today."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickAction to="/invoices/new" label="New invoice" primary />
            <QuickAction to="/clients/new" label="New client" />
            {fin ? <QuickAction to="/reports" label="Reports" /> : <QuickAction to="/invoices" label="All invoices" />}
            {role === 'ADMIN' && fin && <QuickAction to="/settings/backup" label="Backup" />}
          </div>
        </div>
      </section>

      {milestone &&
        (milestoneHidden ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-amber-200 px-4 py-2 text-sm text-slate-500">
            <span>
              <span aria-hidden="true">🏆</span> Milestone banner hidden
            </span>
            <span className="flex items-center gap-2 text-xs">
              Show
              <Switch checked={false} onChange={toggleMilestone} label="Show milestone banner" />
            </span>
          </div>
        ) : (
          <div className="animate-fade-in flex items-center gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 shadow-sm">
            <span className="text-3xl" aria-hidden="true">
              🏆
            </span>
            <div className="flex-1">
              <div className="font-semibold text-amber-900">{milestone.text}</div>
              <div className="text-sm text-amber-800/80">{milestone.sub}</div>
            </div>
            <span className="flex items-center gap-2 text-xs text-amber-800">
              Show
              <Switch checked onChange={toggleMilestone} label="Show milestone banner" />
            </span>
          </div>
        ))}

      {showSetup && (
        <Card
          title={`Getting started · ${stepsDone} of ${steps.length} done`}
          actions={
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={() => {
                setFlag('setupDismissed');
                bump((n) => n + 1);
              }}
            >
              Hide
            </button>
          }
        >
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-green-500 transition-all duration-700" style={{ width: `${(stepsDone / steps.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {steps.map((st) => (
              <li key={st.label}>
                <Link
                  to={st.to}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${st.done ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 hover:border-[var(--brand)] hover:text-[var(--brand)]'}`}
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${st.done ? 'bg-green-500 text-white' : 'border border-slate-300'}`}>{st.done ? '✓' : ''}</span>
                  <span className={st.done ? 'line-through decoration-green-400' : ''}>{st.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Today */}
      <section aria-label="Today" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TodayTile to="/invoices" tone="red" label="Overdue" value={overdue ? String(overdue.length) : '…'} hint={overdue && overdue.length ? (fin ? `₹${formatPaise(overdueSum)} late` : 'Past their due date') : 'Nothing overdue'} />
        {fin ? (
          <TodayTile to="/invoices" tone="amber" label="To collect (FY)" value={year ? `₹${shortRupees(year.outstandingPaise)}` : '…'} hint="Issued, not yet paid" />
        ) : (
          <TodayTile to="/invoices" tone="amber" label="Unpaid invoices" value={unpaid === null ? '…' : String(unpaid)} hint="Issued, not yet paid" />
        )}
        <TodayTile to="/" tone="blue" label="Tasks due" value={dueTasks === null ? '…' : String(dueTasks)} hint={dueTasks ? 'See your task list below' : 'All clear'} />
        <TodayTile
          to="/"
          tone="green"
          label="Today's events"
          value={String(todayEvents.length)}
          hint={todayEvents.length ? todayEvents.map((e) => `${e.time ? `${e.time} ` : ''}${e.title}`).join(' · ') : 'No events today'}
        />
      </section>

      {nudges.length > 0 && (
        <div className="space-y-2">
          {nudges.map((n, i) => (
            <Link key={i} to={n.to} className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-sm text-blue-900 transition hover:bg-blue-50">
              <span aria-hidden="true">💡</span>
              <span className="flex-1">{n.text}</span>
              <span className="text-blue-600">→</span>
            </Link>
          ))}
        </div>
      )}

      {fin ? (
        <>
          {/* Statistics */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Invoiced this month" value={month ? <Money paise={month.invoicedPaise} /> : <Skeleton className="h-7 w-28" />} />
            <StatCard label="Received this month" value={month ? <Money paise={month.receivedPaise} /> : <Skeleton className="h-7 w-28" />} tone="good" />
            <StatCard label="Pending (FY)" value={year ? <Money paise={year.outstandingPaise} /> : <Skeleton className="h-7 w-28" />} tone="warn" />
            <StatCard label="Clients" value={clients ?? <Skeleton className="h-7 w-12" />} hint={<Link className="text-[var(--brand)] hover:underline" to="/clients">View all</Link>} />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Last 6 months" className="lg:col-span-2" actions={<LinkButton variant="ghost" to="/reports">Full reports →</LinkButton>}>
              {!series ? <Skeleton className="h-48" /> : <BarChart data={series} aLabel="Invoiced" bLabel="Received" height={170} />}
            </Card>
            <Card title={goal ? 'Monthly goal' : `Collection · FY ${fy}`}>
              <div className="flex flex-col items-center gap-3 text-center">
                {goal ? (
                  <>
                    <Ring pct={goalPct} size={140} stroke={13} color={goalPct >= 100 ? '#16a34a' : 'var(--brand)'}>
                      <span className="text-2xl font-semibold tabular-nums">{goalPct}%</span>
                      <span className="text-[11px] text-slate-500">of goal</span>
                    </Ring>
                    <p className="text-sm text-slate-600">
                      {month ? <Money paise={month.receivedPaise} /> : '…'} of <Money paise={goal} /> this month
                      {goalPct >= 100 && <span className="block font-medium text-green-700">Goal reached 🎉</span>}
                    </p>
                  </>
                ) : (
                  <>
                    <Ring pct={collected} size={140} stroke={13} color="#16a34a">
                      <span className="text-2xl font-semibold tabular-nums">{collected}%</span>
                      <span className="text-[11px] text-slate-500">collected</span>
                    </Ring>
                    <p className="text-sm text-slate-600">
                      {year ? (
                        <>
                          <Money paise={year.receivedPaise} /> of <Money paise={year.invoicedPaise} />
                        </>
                      ) : (
                        '…'
                      )}
                    </p>
                    {role === 'ADMIN' && (
                      <Link to="/settings" className="text-xs text-[var(--brand)] hover:underline">
                        Set a monthly goal in Settings
                      </Link>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Clients" value={clients ?? <Skeleton className="h-7 w-12" />} hint={<Link className="text-[var(--brand)] hover:underline" to="/clients">View all</Link>} />
          <StatCard label="Invoices issued, all time" value={numbered ?? <Skeleton className="h-7 w-12" />} />
          <StatCard label="Unpaid invoices" value={unpaid ?? <Skeleton className="h-7 w-12" />} tone="warn" hint={<Link className="text-[var(--brand)] hover:underline" to="/invoices">See invoices</Link>} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {fin && (
          <Card title="This week" className="lg:col-span-1">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Invoiced (last 7 days)</dt>
                <dd className="font-semibold">{week ? <Money paise={week.invoicedPaise} /> : '…'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Received (last 7 days)</dt>
                <dd className="font-semibold text-green-700">{week ? <Money paise={week.receivedPaise} /> : '…'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Invoices issued, all time</dt>
                <dd className="font-semibold">{numbered ?? '…'}</dd>
              </div>
            </dl>
          </Card>
        )}
        <Card title="Recent activity" className={fin ? 'lg:col-span-2' : 'lg:col-span-3'} actions={role === 'ADMIN' ? <LinkButton variant="ghost" to="/settings/activity">All activity →</LinkButton> : undefined}>
          {!activity ? (
            <SkeletonRows rows={3} />
          ) : activity.length === 0 ? (
            <Empty>No activity yet. Create your first invoice to get started.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  {e.action === 'DELETE' ? (
                    <span className="truncate">{describeAudit(e)}</span>
                  ) : (
                    <Link to={`/invoices/${e.invoiceId}`} className="truncate hover:text-[var(--brand)] hover:underline">
                      {describeAudit(e)}
                    </Link>
                  )}
                  <span className="shrink-0 text-xs text-slate-500">{timeAgo(e.at?.toDate())}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TasksWidget today={today} />
        <EventsWidget today={today} />
        <NotesWidget />
        <LinksWidget />
      </div>

      <Card title="Overdue invoices" actions={<LinkButton variant="ghost" to="/invoices">All invoices →</LinkButton>}>
        {!overdue ? (
          <SkeletonRows rows={2} />
        ) : overdue.length === 0 ? (
          <Empty icon={<span className="text-xl">🎉</span>}>Nothing overdue. Great work!</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overdue.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/invoices/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 transition hover:bg-slate-50">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.number}</span> <span className="text-sm text-slate-500">· {r.client.name}</span>
                    <OverdueBadge dueDate={r.dueDate} today={today} status={r.status} />
                  </span>
                  <Money paise={r.totals.grandTotalPaise} className="font-semibold text-red-700" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TodayTile({ to, label, value, hint, tone }: { to: string; label: string; value: string; hint: string; tone: 'red' | 'amber' | 'blue' | 'green' }) {
  const bar = { red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500', green: 'bg-green-500' }[tone];
  return (
    <Link to={to} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500" title={hint}>
        {hint}
      </div>
    </Link>
  );
}

function QuickAction({ to, label, primary }: { to: string; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={`rounded-xl px-4 py-2.5 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${primary ? 'bg-white text-[#0b3d63]' : 'bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25'}`}
    >
      {label}
    </Link>
  );
}

function StatCard({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'warn' }) {
  const toneCls = { default: 'text-slate-900', good: 'text-green-700', warn: 'text-amber-700' }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </div>
  );
}

function DeleteBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 6l12 12M6 18L18 6" />
      </svg>
    </button>
  );
}

function TasksWidget({ today }: { today: string }) {
  const { items, error, reload, uid } = useHomeItems('tasks');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const due = (items ?? []).filter((t) => !t.done && (t.date ?? '') <= today);
  const later = (items ?? []).filter((t) => !t.done && (t.date ?? '') > today).slice(0, 3);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await addHome(db, uid, 'tasks', { title: title.trim(), date, done: false });
    setTitle('');
    reload();
  }
  return (
    <Card title={`Tasks due today (${due.length})`}>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={add} className="mb-4 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9.5rem_auto]">
        <input className="col-span-2 sm:col-span-1" placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" />
        <Button type="submit">Add</Button>
      </form>
      {items && due.length === 0 && <Empty>No tasks due today.</Empty>}
      <ul className="space-y-1">
        {due.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50">
            <input
              type="checkbox"
              className="h-4 w-4"
              aria-label={`Mark "${t.title}" done`}
              onChange={async () => {
                await updateHome(db, 'tasks', t.id, { done: true });
                reload();
              }}
            />
            <span className="flex-1 text-sm">{t.title}</span>
            {t.date && t.date < today && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">overdue</span>}
            <DeleteBtn label="Delete task" onClick={async () => (await deleteHome(db, 'tasks', t.id), reload())} />
          </li>
        ))}
      </ul>
      {later.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Coming up: {later.map((t) => `${t.title} (${t.date})`).join(' · ')}
        </p>
      )}
    </Card>
  );
}

function EventsWidget({ today }: { today: string }) {
  const { items, error, reload, uid } = useHomeItems('events');
  const [form, setForm] = useState({ title: '', date: today, time: '' });
  const upcoming = (items ?? []).filter((e) => (e.date ?? '') >= today).slice(0, 6);
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await addHome(db, uid, 'events', { title: form.title.trim(), date: form.date, time: form.time });
    setForm({ title: '', date: today, time: '' });
    reload();
  }
  return (
    <Card title="Upcoming events">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={add} className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_9.5rem_7rem_auto]">
        <input className="col-span-2 sm:col-span-1" placeholder="Meeting, due date, hearing…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Event" />
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
        <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} aria-label="Time" />
        <Button type="submit" className="col-span-2 sm:col-span-1">
          Add
        </Button>
      </form>
      {items && upcoming.length === 0 && <Empty>No upcoming events.</Empty>}
      <ul className="space-y-2">
        {upcoming.map((ev) => {
          const d = new Date(`${ev.date}T00:00:00`);
          return (
            <li key={ev.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-slate-50">
              <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-[var(--brand)]/10 py-1 text-[var(--brand)]">
                <span className="text-[10px] font-semibold uppercase">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                <span className="text-lg font-semibold leading-none">{d.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{ev.title}</div>
                <div className="text-xs text-slate-500">
                  {ev.date === today ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'long' })}
                  {ev.time ? ` · ${ev.time}` : ''}
                </div>
              </div>
              <DeleteBtn label="Delete event" onClick={async () => (await deleteHome(db, 'events', ev.id), reload())} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function NotesWidget() {
  const { items, error, reload, uid } = useHomeItems('notes');
  const dialog = useDialog();
  const [text, setText] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await addHome(db, uid, 'notes', { text: text.trim() });
    setText('');
    reload();
  }
  return (
    <Card title="Recent notes">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={add} className="mb-4 space-y-2">
        <textarea rows={2} className="w-full" placeholder="Jot something down…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Note" />
        <div className="flex justify-end">
          <Button type="submit">Save note</Button>
        </div>
      </form>
      {items && items.length === 0 && <Empty>No notes yet.</Empty>}
      <ul className="space-y-2">
        {(items ?? []).slice(0, 4).map((n) => (
          <li key={n.id} className="group rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <p className="flex-1 whitespace-pre-line text-sm">{n.text}</p>
              <button
                type="button"
                className="text-xs text-[var(--brand)] opacity-70 hover:underline group-hover:opacity-100"
                onClick={async () => {
                  const next = await dialog.prompt({ title: 'Edit note', defaultValue: n.text, confirmText: 'Save' });
                  if (next !== null && next.trim()) {
                    await updateHome(db, 'notes', n.id, { text: next.trim() });
                    reload();
                  }
                }}
              >
                Edit
              </button>
              <DeleteBtn label="Delete note" onClick={async () => (await deleteHome(db, 'notes', n.id), reload())} />
            </div>
            {n.updatedAt && <div className="mt-1 text-xs text-slate-500">{n.updatedAt.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LinksWidget() {
  const { items, error, reload, uid } = useHomeItems('links');
  const [form, setForm] = useState({ title: '', url: '' });
  const [formError, setFormError] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    let url = form.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      return setFormError('Enter a valid web address');
    }
    setFormError('');
    await addHome(db, uid, 'links', { title: form.title.trim() || new URL(url).hostname, url });
    setForm({ title: '', url: '' });
    reload();
  }
  return (
    <Card title="Favourite links">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={add} className="mb-4 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <input className="col-span-2 sm:col-span-1" placeholder="Name (e.g. GST portal)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Link name" />
        <input placeholder="gst.gov.in" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} aria-label="Web address" />
        <Button type="submit">Add</Button>
      </form>
      {formError && <p className="-mt-2 mb-2 text-xs text-red-600">{formError}</p>}
      {items && items.length === 0 && <Empty>Save the sites you open often: GST portal, Income Tax, MCA, your bank…</Empty>}
      <div className="grid gap-2 sm:grid-cols-2">
        {(items ?? []).map((l) => (
          <div key={l.id} className="group flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 transition hover:border-[var(--brand)] hover:shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--brand)]" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
              {l.title}
            </a>
            <DeleteBtn label="Delete link" onClick={async () => (await deleteHome(db, 'links', l.id), reload())} />
          </div>
        ))}
      </div>
    </Card>
  );
}
