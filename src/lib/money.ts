// Money helpers. Amounts are integer paise everywhere; floats never touch
// stored values.

/** Round half away from zero to the nearest integer. */
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/**
 * Parse a rupee string typed by a user ("1,23,456.7") into integer paise
 * without going through floating point. Returns null for invalid input.
 */
export function parseRupeesToPaise(input: string): number | null {
  const s = input.replace(/[,\s₹]/g, '').replace(/^Rs\.?/i, '');
  if (s === '') return null;
  const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const rupees = Number(m[2]);
  const paise = Number((m[3] ?? '').padEnd(2, '0'));
  const total = rupees * 100 + paise;
  if (!Number.isSafeInteger(total)) return null;
  return m[1] ? -total : total;
}

/** Group digits Indian style: 12345678 -> "1,23,45,678". */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** 12345678 paise -> "1,23,456.78" */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error('paise must be an integer');
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toString();
  const p = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${groupIndian(rupees)}.${p}`;
}

/** Paise -> plain editable rupee string ("1234.5" style, no grouping). */
export function paiseToInput(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = Math.floor(abs / 100);
  const p = abs % 100;
  return `${neg ? '-' : ''}${r}${p ? '.' + p.toString().padStart(2, '0') : ''}`;
}
