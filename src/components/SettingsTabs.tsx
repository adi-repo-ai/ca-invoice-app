import { NavLink } from 'react-router-dom';

/** Sub-navigation inside Settings: firm details, users, backup. */
export function SettingsTabs() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-[var(--brand)] text-white' : 'text-slate-700 hover:bg-slate-100'}`;
  return (
    <nav className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      <NavLink to="/settings" end className={cls}>
        Firm details
      </NavLink>
      <NavLink to="/settings/users" className={cls}>
        Users
      </NavLink>
      <NavLink to="/settings/backup" className={cls}>
        Backup
      </NavLink>
    </nav>
  );
}
