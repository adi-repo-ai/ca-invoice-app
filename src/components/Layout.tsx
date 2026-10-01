import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { logout, useAuth } from '../auth';
import { USING_EMULATORS } from '../firebase';
import { useSettings } from '../settings-context';

export function Layout() {
  const { user, role } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const links = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/invoices', label: 'Invoices' },
    { to: '/clients', label: 'Clients' },
    ...(role === 'ADMIN'
      ? [
          { to: '/settings', label: 'Settings' },
          { to: '/users', label: 'Users' },
          { to: '/backup', label: 'Backup' },
        ]
      : []),
  ];
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `block rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'}`;

  return (
    <div className="min-h-screen">
      {USING_EMULATORS && (
        <div className="bg-amber-400 px-4 py-1 text-center text-xs font-medium text-amber-950">
          Local emulator mode — not real data
        </div>
      )}
      <header className="bg-[var(--brand)] text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {settings.logoDataUrl && (
              <img src={settings.logoDataUrl} alt="" className="h-8 w-auto rounded bg-white p-0.5" />
            )}
            <span className="truncate font-semibold">{settings.name || 'Invoices'}</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-xs text-white/80">
              {user?.email} · {role}
            </span>
            <button onClick={logout} className="rounded-md border border-white/40 px-3 py-1 text-sm hover:bg-white/10">
              Sign out
            </button>
          </div>
          <button className="rounded-md p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={open ? 'M6 6l12 12M6 18L18 6' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>
        {open && (
          <div className="space-y-1 border-t border-white/20 px-4 pb-4 pt-2 md:hidden" onClick={() => setOpen(false)}>
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
                {l.label}
              </NavLink>
            ))}
            <div className="flex items-center justify-between pt-2 text-xs text-white/80">
              <span>
                {user?.email} · {role}
              </span>
              <button onClick={logout} className="rounded-md border border-white/40 px-3 py-1 text-sm text-white">
                Sign out
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4">
        <Outlet />
      </main>
    </div>
  );
}
