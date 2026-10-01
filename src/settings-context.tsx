import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadSettings } from './data/settings';
import { db } from './firebase';
import { DEFAULT_SETTINGS } from './lib/defaults';
import type { FirmSettings } from './lib/types';

interface Ctx {
  settings: FirmSettings;
  saved: boolean; // false until an ADMIN has saved settings at least once
  loading: boolean;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<Ctx>({
  settings: DEFAULT_SETTINGS,
  saved: false,
  loading: true,
  reload: async () => {},
});

/** Loads the firm settings doc once per session (1 read) and shares it. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ settings: DEFAULT_SETTINGS, saved: false, loading: true });
  const reload = useCallback(async () => {
    const r = await loadSettings(db);
    setState({ ...r, loading: false });
  }, []);
  useEffect(() => {
    reload().catch(() => setState((s) => ({ ...s, loading: false })));
  }, [reload]);
  useEffect(() => {
    document.documentElement.style.setProperty('--brand', state.settings.brandColor);
    if (state.settings.name) document.title = `Invoices · ${state.settings.name}`;
  }, [state.settings.brandColor, state.settings.name]);
  return <SettingsContext.Provider value={{ ...state, reload }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
