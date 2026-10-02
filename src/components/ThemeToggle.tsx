import { useState } from 'react';
import { applyTheme, isDark } from '../theme';

/** Sun / moon button that switches between day and night themes. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(isDark());
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(dark ? 'light' : 'dark');
        setDark(!dark);
      }}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/10 ${className}`}
      aria-label={dark ? 'Switch to day theme' : 'Switch to night theme'}
      title={dark ? 'Day theme' : 'Night theme'}
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
