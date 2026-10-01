// Minimal RFC 4180 CSV writer with spreadsheet formula-injection protection.

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Text starting with = + - @ could run as a formula in Excel/Sheets.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Paise -> "1234.50" (plain number for spreadsheets). */
export function paiseToDecimal(p: number): string {
  const neg = p < 0;
  const a = Math.abs(p);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
