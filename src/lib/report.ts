// Financial-year report numbers, computed from a list of invoices.
import type { Invoice } from './types';
import { daysBetween } from './messages';

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
/** Index 0..11 of a date inside an April–March financial year. */
const fyMonth = (iso: string) => (Number(iso.slice(5, 7)) + 8) % 12;

export interface ClientSum {
  key: string;
  clientId: string;
  name: string;
  count: number;
  billed: number;
  received: number;
  outstanding: number;
}

export function buildReport(rows: (Invoice & { id?: string })[], today: string) {
  const live = rows.filter((r) => r.status === 'ISSUED' || r.status === 'PAID');
  const months = MONTHS.map((label) => ({ label, a: 0, b: 0 }));
  const ageing = { notDue: 0, d30: 0, d60: 0, d90: 0, d90p: 0 };
  const clients = new Map<string, ClientSum>();
  let billed = 0;
  let received = 0;
  let outstanding = 0;
  let taxable = 0;
  let tax = 0;
  let paidDays = 0;
  let paidCount = 0;
  for (const r of live) {
    const total = r.totals.grandTotalPaise;
    billed += total;
    taxable += r.totals.taxablePaise;
    tax += r.totals.taxPaise;
    months[fyMonth(r.invoiceDate)].a += total;
    const key = r.clientId || `name:${r.client.name.toLowerCase()}`;
    const c = clients.get(key) ?? { key, clientId: r.clientId, name: r.client.name, count: 0, billed: 0, received: 0, outstanding: 0 };
    c.count++;
    c.billed += total;
    if (r.status === 'PAID' && r.payment) {
      const got = r.payment.amountPaise + r.payment.tdsPaise;
      received += got;
      c.received += got;
      months[fyMonth(r.payment.date)].b += got;
      paidDays += Math.max(0, daysBetween(r.invoiceDate, r.payment.date));
      paidCount++;
    } else {
      outstanding += total;
      c.outstanding += total;
      const late = daysBetween(r.dueDate, today);
      if (late <= 0) ageing.notDue += total;
      else if (late <= 30) ageing.d30 += total;
      else if (late <= 60) ageing.d60 += total;
      else if (late <= 90) ageing.d90 += total;
      else ageing.d90p += total;
    }
    clients.set(key, c);
  }
  const list = [...clients.values()];
  return {
    count: live.length,
    cancelled: rows.filter((r) => r.status === 'CANCELLED').length,
    drafts: rows.filter((r) => r.status === 'DRAFT').length,
    billed,
    received,
    outstanding,
    taxable,
    tax,
    avgDays: paidCount ? Math.round(paidDays / paidCount) : null,
    rate: billed ? Math.round((received / billed) * 100) : 0,
    months,
    ageing,
    top: [...list].sort((a, b) => b.billed - a.billed).slice(0, 10),
    owing: list.filter((c) => c.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding),
    clientCount: list.length,
  };
}

