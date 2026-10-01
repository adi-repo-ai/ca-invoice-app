// Day / night theme: 'light', 'dark' or 'system' (follows the device).
export type ThemeChoice = 'light' | 'dark' | 'system';

export function getTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', choice);
  } catch {
    /* storage unavailable: still apply for this page view */
  }
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}
