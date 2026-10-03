import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { logout, useAuth } from '../auth';
import { useSettings } from '../settings-context';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  invoices: <path d="M7 3h8l4 4v14H7zM14 3v5h5M10 12h6M10 16h6" />,
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  clients: <path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
};

function Icon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Layout() {
  const { user, role, fin } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [fab, setFab] = useState(false);
  useEffect(() => {
    setOpen(false);
    setFab(false);
  }, [location.pathname]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
        return;
      }
      const el = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearch(true);
      } else if (e.key === '?') setHelp(true);
      else if (e.key === 'n') navigate('/invoices/new');
      else if (e.key === 'c') navigate('/clients/new');
      else if (e.key === 'Escape') setHelp(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const links = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/invoices', label: 'Invoices', icon: 'invoices' },
    { to: '/clients', label: 'Clients', icon: 'clients' },
    ...(fin ? [{ to: '/reports', label: 'Reports', icon: 'reports' }] : []),
    ...(role === 'ADMIN' ? [{ to: '/settings', label: 'Settings', icon: 'settings' }] : []),
  ];
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/20 text-white shadow-inner' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;
  const who = user?.displayName || user?.email || '';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-[var(--brand)] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-3">
            {settings.logoDataUrl && <img src={settings.logoDataUrl} alt="" className="h-9 w-auto rounded-md bg-white p-0.5" />}
            <span className="truncate text-base font-semibold tracking-tight">{settings.name || 'Invoices'}</span>
          </NavLink>
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                <Icon name={l.icon} />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <button
              type="button"
              onClick={() => setSearch(true)}
              className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/20 transition hover:bg-white/20 2xl:flex"
              aria-label="Search (Ctrl+K)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              Search
              <kbd className="rounded bg-white/15 px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <button type="button" onClick={() => setSearch(true)} className="rounded-lg p-2 text-white hover:bg-white/10 2xl:hidden" aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <NotificationBell />
            <ThemeToggle className="text-white" />
            <span className="hidden max-w-40 truncate text-xs text-white/80 2xl:block" title={`${who} · ${role}`}>
              {who}
            </span>
            <button onClick={logout} title={`Signed in as ${who} (${role})`} className="whitespace-nowrap rounded-lg border border-white/40 px-3 py-1.5 text-sm transition hover:bg-white/10">
              Sign out
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 lg:hidden">
            <button type="button" onClick={() => setSearch(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <NotificationBell />
            <ThemeToggle className="text-white" />
            <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d={open ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <div className="animate-fade-in space-y-1 border-t border-white/20 px-4 pb-4 pt-2 lg:hidden">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                <Icon name={l.icon} />
                {l.label}
              </NavLink>
            ))}
            <div className="flex items-center justify-between gap-2 pt-3 text-xs text-white/80">
              <span className="truncate">
                {who} · {role}
              </span>
              <button onClick={logout} className="rounded-lg border border-white/40 px-3 py-1.5 text-sm text-white">
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>
      <main key={location.pathname} className="mx-auto max-w-7xl animate-fade-in px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
        © {new Date().getFullYear()} {settings.name}. Private portal — authorised users only. ·{' '}
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setHelp(true)}>
          Keyboard shortcuts
        </button>
      </footer>

      {/* Phones / tablets: floating "+" for the most common actions */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 lg:hidden">
        {fab && (
          <div className="animate-fade-in flex flex-col items-end gap-2">
            <Link to="/clients/new" className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-slate-200">
              New client
            </Link>
            <Link to="/invoices/new" className="rounded-full bg-surface px-4 py-2 text-sm font-medium text-slate-800 shadow-lg ring-1 ring-slate-200">
              New invoice
            </Link>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFab(!fab)}
          aria-label={fab ? 'Close quick actions' : 'Quick actions'}
          aria-expanded={fab}
          className={`flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-3xl font-light text-white shadow-xl transition ${fab ? 'rotate-45' : ''}`}
        >
          +
        </button>
      </div>

      {search && <CommandPalette onClose={() => setSearch(false)} />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Ctrl+K', 'Search clients, invoices and pages'],
    ['/', 'Search (alternative)'],
    ['N', 'New invoice'],
    ['C', 'New client'],
    ['?', 'Show this help'],
    ['Esc', 'Close a dialog or menu'],
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-label="Keyboard shortcuts" className="animate-fade-in w-full max-w-sm rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold">Keyboard shortcuts</h2>
        <dl className="space-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dd className="text-slate-600">{v}</dd>
              <dt>
                <kbd className="whitespace-nowrap rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-xs">{k}</kbd>
              </dt>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-[var(--brand)] py-2 text-sm font-medium text-white">
          Got it
        </button>
      </div>
    </div>
  );
}
