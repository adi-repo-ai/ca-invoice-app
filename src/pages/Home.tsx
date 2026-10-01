import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useDialog } from '../components/Dialog';
import { Button, Card, Empty, LinkButton, Money, errorMessage } from '../components/ui';
import { countClients } from '../data/clients';
import { addHome, deleteHome, listHome, updateHome, type HomeItem, type HomeKind } from '../data/home';
import { listOverdue, periodTotals, type InvoiceRow, type PeriodTotals } from '../data/invoices';
import { db } from '../firebase';
import { fyForDate, fyRange, monthRange, todayIST } from '../lib/fy';

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

export default function Home() {
  const { user, role } = useAuth();
  const now = useClock();
  const today = todayIST();
  const fy = fyForDate(today);
  const [month, setMonth] = useState<PeriodTotals | null>(null);
  const [year, setYear] = useState<PeriodTotals | null>(null);
  const [clients, setClients] = useState<number | null>(null);
  const [overdue, setOverdue] = useState<InvoiceRow[] | null>(null);

  useEffect(() => {
    const m = monthRange(today);
    const y = fyRange(fy);
    periodTotals(db, m.start, m.end).then(setMonth).catch(() => undefined);
    periodTotals(db, y.start, y.end).then(setYear).catch(() => undefined);
    countClients(db).then(setClients).catch(() => undefined);
    listOverdue(db, today, 5).then(setOverdue).catch(() => setOverdue([]));
  }, [today, fy]);

  const name = (user?.displayName || user?.email?.split('@')[0] || '').trim();
  const collected = year && year.invoicedPaise > 0 ? Math.min(100, Math.round((year.receivedPaise / year.invoicedPaise) * 100)) : 0;

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
            <p className="mt-1 text-sm text-white/80">Here's what's happening today.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickAction to="/invoices/new" label="New invoice" primary />
            <QuickAction to="/clients/new" label="New client" />
            <QuickAction to="/invoices" label="All invoices" />
            {role === 'ADMIN' && <QuickAction to="/settings/backup" label="Backup" />}
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Invoiced this month" value={month ? <Money paise={month.invoicedPaise} /> : '…'} />
        <StatCard label="Received this month" value={month ? <Money paise={month.receivedPaise} /> : '…'} tone="good" />
        <StatCard label="Pending (FY)" value={year ? <Money paise={year.outstandingPaise} /> : '…'} tone="warn" />
        <StatCard label="Clients" value={clients ?? '…'} hint={<Link className="text-[var(--brand)] hover:underline" to="/clients">View all</Link>} />
      </section>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">Collection progress · FY {fy}</span>
          <span className="text-slate-500">
            {year ? (
              <>
                <Money paise={year.receivedPaise} /> of <Money paise={year.invoicedPaise} /> received
              </>
            ) : (
              '…'
            )}
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={collected} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-[var(--brand)] to-green-500 transition-all duration-700" style={{ width: `${collected}%` }} />
        </div>
        <div className="mt-1 text-right text-xs text-slate-500">{collected}% collected</div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TasksWidget today={today} />
        <EventsWidget today={today} />
        <NotesWidget />
        <LinksWidget />
      </div>

      <Card title="Overdue invoices" actions={<LinkButton variant="ghost" to="/invoices">All invoices →</LinkButton>}>
        {!overdue ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : overdue.length === 0 ? (
          <Empty>Nothing overdue. 🎉</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {overdue.map((r) => (
              <li key={r.id}>
                <Link to={`/invoices/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 transition hover:bg-slate-50">
                  <span>
                    <span className="font-medium">{r.number}</span> <span className="text-sm text-slate-500">· {r.client.name} · due {r.dueDate}</span>
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
