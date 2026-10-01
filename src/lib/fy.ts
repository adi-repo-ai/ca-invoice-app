// Indian financial year (April–March) and invoice-number helpers.

/** Today's date in India (Asia/Kolkata) as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "2027-03-31" -> "2026-27"; "2027-04-01" -> "2027-28". */
export function fyForDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) throw new Error(`invalid date: ${isoDate}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First and last day (inclusive) of a financial year, as YYYY-MM-DD. */
export function fyRange(fy: string): { start: string; end: string } {
  const start = Number(fy.slice(0, 4));
  return { start: `${start}-04-01`, end: `${start + 1}-03-31` };
}

/** First and last day (inclusive) of the month containing isoDate. */
export function monthRange(isoDate: string): { start: string; end: string } {
  const [y, m] = isoDate.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const INVOICE_PREFIX_RE = /^[A-Z]{1,3}$/;
export const MAX_INVOICE_NUMBER_LENGTH = 16; // GST rule 46(b)
export const MAX_SEQ = 9999;

/** ("LKA", "2026-27", 1) -> "LKA/2026-27/0001" (always <= 16 characters). */
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string {
  if (!INVOICE_PREFIX_RE.test(prefix)) throw new Error('Invoice prefix must be 1–3 capital letters');
  if (!/^\d{4}-\d{2}$/.test(fy)) throw new Error(`invalid financial year: ${fy}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > MAX_SEQ) throw new Error(`invoice sequence out of range: ${seq}`);
  const n = `${prefix}/${fy}/${String(seq).padStart(4, '0')}`;
  if (n.length > MAX_INVOICE_NUMBER_LENGTH) throw new Error('invoice number exceeds 16 characters');
  return n;
}

/**
 * Given the per-FY counter's last-used sequence (null when the counter
 * document doesn't exist yet, i.e. first invoice of a new FY), return the
 * next number. Counters are keyed by FY, so numbering restarts at 0001 every
 * 1 April.
 */
export function nextInvoiceNumber(
  prefix: string,
  issueDate: string,
  counterLast: number | null,
): { fy: string; seq: number; number: string } {
  const fy = fyForDate(issueDate);
  const seq = (counterLast ?? 0) + 1;
  return { fy, seq, number: formatInvoiceNumber(prefix, fy, seq) };
}

/** PDF filename: "LKA/2026-27/0001" + "Acme / Co" -> "LKA-2026-27-0001_Acme-Co.pdf" */
export function invoiceFileName(number: string, clientName: string): string {
  const clean = (s: string) =>
    s
      .replace(/[\\/]+/g, '-')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  return `${clean(number)}_${clean(clientName) || 'client'}.pdf`;
}
