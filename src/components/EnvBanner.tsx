import { USING_EMULATORS } from '../firebase';
import { isTestHost } from '../lib/siteEnv';

/** Yellow strip on every page of a non-live copy, so it is never mistaken for the real portal. */
export function EnvBanner() {
  const text = USING_EMULATORS
    ? 'Local emulator mode — not real data'
    : typeof window !== 'undefined' && isTestHost(window.location.hostname)
      ? 'TEST SITE — not real data. Use made-up clients only.'
      : '';
  if (!text) return null;
  return <div className="bg-amber-400 px-4 py-1 text-center text-xs font-medium text-amber-950">{text}</div>;
}
