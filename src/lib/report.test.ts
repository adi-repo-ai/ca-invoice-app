import { describe, expect, it } from 'vitest';
import { buildReport } from './report';
import type { Invoice } from './types';

const inv = (o: Partial<Invoice> & { total: number }): Invoice =>
  ({
    status: 'ISSUED',
    clientId: 'c1',
    client: { name: 'Rama' },
    invoiceDate: '2026-04-10',
    dueDate: '2026-04-25',
    totals: { grandTotalPaise: o.total, taxablePaise: o.total, taxPaise: 0 },
    ...o,
  }) as unknown as Invoice;

describe('buildReport', () => {
  it('totals, months, ageing and client ranking', () => {
    const r = buildReport(
      [
        inv({ total: 10000, status: 'PAID', payment: { date: '2026-05-05', mode: 'UPI', amountPaise: 9000, tdsPaise: 1000, reference: '' } }),
        inv({ total: 5000, invoiceDate: '2026-06-01', dueDate: '2026-06-16' }), // 30+ days late on 2026-07-20
        inv({ total: 3000, clientId: '', client: { name: 'Walk-in' } as Invoice['client'], invoiceDate: '2026-07-15', dueDate: '2026-07-30' }), // not due
        inv({ total: 999, status: 'CANCELLED' }),
        inv({ total: 1, status: 'DRAFT' }),
      ],
      '2026-07-20',
    );
    expect(r).toMatchObject({ count: 3, cancelled: 1, drafts: 1, billed: 18000, received: 10000, outstanding: 8000, avgDays: 25, rate: 56 });
    expect(r.months[0]).toMatchObject({ label: 'Apr', a: 10000, b: 0 });
    expect(r.months[1]).toMatchObject({ label: 'May', b: 10000 });
    expect(r.ageing).toMatchObject({ notDue: 3000, d60: 5000 });
    expect(r.top.map((c) => c.name)).toEqual(['Rama', 'Walk-in']);
    expect(r.owing.map((c) => [c.name, c.outstanding])).toEqual([
      ['Rama', 5000],
      ['Walk-in', 3000],
    ]);
  });
});
