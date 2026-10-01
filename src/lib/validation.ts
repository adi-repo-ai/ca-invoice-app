// Format validators for Indian tax identifiers and contact details.

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const SAC_RE = /^[0-9]{4,8}$/;

export function isValidGstin(v: string): boolean {
  return v.length === 15 && GSTIN_RE.test(v);
}

export function isValidPan(v: string): boolean {
  return PAN_RE.test(v);
}

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

/**
 * Normalise a WhatsApp number to digits with country code (wa.me format).
 * 10-digit Indian mobile numbers get "91" prepended. Returns null if invalid.
 */
export function normaliseWhatsapp(v: string): string | null {
  let d = v.replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}
