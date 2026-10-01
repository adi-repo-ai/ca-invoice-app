import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout, useAuth } from '../auth';
import { USING_EMULATORS } from '../firebase';
import { useSettings } from '../settings-context';
import { ThemeToggle } from './ThemeToggle';

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  invoices: <path d="M7 3h8l4 4v14H7zM14 3v5h5M10 12h6M10 16h6" />,
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
  const { user, role } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location.pathname]);

  const links = [
    { to: '/', label: 'Home', icon: 'home', end: true },
    { to: '/invoices', label: 'Invoices', icon: 'invoices' },
    { to: '/clients', label: 'Clients', icon: 'clients' },
    ...(role === 'ADMIN' ? [{ to: '/settings', label: 'Settings', icon: 'settings' }] : []),
  ];
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/20 text-white shadow-inner' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;
  const who = user?.displayName || user?.email || '';

  return (
    <div className="min-h-screen">
      {USING_EMULATORS && (
        <div className="bg-amber-400 px-4 py-1 text-center text-xs font-medium text-amber-950">Local emulator mode — not real data</div>
      )}
      <header className="sticky top-0 z-30 bg-[var(--brand)] text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <NavLink to="/" className="flex min-w-0 items-center gap-3">
            {settings.logoDataUrl && <img src={settings.logoDataUrl} alt="" className="h-9 w-auto rounded-md bg-white p-0.5" />}
            <span className="truncate text-base font-semibold tracking-tight">{settings.name || 'Invoices'}</span>
          </NavLink>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                <Icon name={l.icon} />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle className="text-white" />
            <span className="max-w-48 truncate text-xs text-white/80" title={`${who} · ${role}`}>
              {who}
            </span>
            <button onClick={logout} className="rounded-lg border border-white/40 px-3 py-1.5 text-sm transition hover:bg-white/10">
              Sign out
            </button>
          </div>
          <div className="flex items-center gap-1 lg:hidden">
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
        © {new Date().getFullYear()} {settings.name}. Private portal — authorised users only.
      </footer>
    </div>
  );
}
