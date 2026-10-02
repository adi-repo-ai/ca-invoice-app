// WhatsApp / email message text built from the editable templates in Settings.
import { paiseToDecimal } from './csv';
import { formatPaise } from './money';
import type { FirmSettings, Invoice } from './types';

/**
 * UPI "pay" link for the invoice amount (works with GPay, PhonePe, Paytm, BHIM…).
 * Only for unpaid invoices when a UPI ID is set.
 */
export function upiPayLink(invoice: Invoice, settings: FirmSettings): string | null {
  const firm = invoice.firm ?? settings;
  const upi = firm.bank.upiId?.trim();
  if (!upi || invoice.status === 'PAID' || invoice.status === 'CANCELLED') return null;
  if (invoice.totals.grandTotalPaise <= 0) return null;
  const params = new URLSearchParams({
    pa: upi,
    pn: firm.name,
    am: paiseToDecimal(invoice.totals.grandTotalPaise),
    cu: 'INR',
    tn: `Invoice ${invoice.number ?? ''}`.trim(),
  });
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export type MessageKind = 'invoice' | 'reminder' | 'receipt';

/** Fill a template; lines that end up empty (e.g. no UPI ID) are dropped. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

export function invoiceMessage(kind: MessageKind, inv: Invoice, settings: FirmSettings, today: string): string {
  const firm = inv.firm ?? settings;
  const upi = firm.bank.upiId?.trim() ?? '';
  const amountPaise = kind === 'receipt' && inv.payment ? inv.payment.amountPaise + inv.payment.tdsPaise : inv.totals.grandTotalPaise;
  const vars: Record<string, string> = {
    client: inv.client.contactPerson || inv.client.name,
    number: inv.number ?? 'DRAFT',
    date: inv.invoiceDate,
    due: inv.dueDate,
    amount: formatPaise(amountPaise),
    days: String(Math.max(0, daysBetween(inv.dueDate, today))),
    upi: upi ? `UPI: ${upi}` : '',
    paylink: upi && kind !== 'receipt' ? `Pay by UPI: ${upi}` : '',
    firm: firm.name,
    paidDate: inv.payment?.date ?? '',
  };
  return fillTemplate(settings.templates[kind], vars);
}
