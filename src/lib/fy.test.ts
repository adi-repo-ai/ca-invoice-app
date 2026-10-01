import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatInvoiceNumber,
  fyForDate,
  fyRange,
  invoiceFileName,
  monthRange,
  nextInvoiceNumber,
  todayIST,
} from './fy';

describe('financial year', () => {
  it('rolls over on 1 April', () => {
    expect(fyForDate('2027-03-31')).toBe('2026-27');
    expect(fyForDate('2027-04-01')).toBe('2027-28');
    expect(fyForDate('2026-01-15')).toBe('2025-26');
    expect(fyForDate('2099-12-31')).toBe('2099-00');
  });

  it('uses Indian time for "today"', () => {
    // 31 Mar 2027 20:00 UTC is already 1 Apr 2027 01:30 IST.
    expect(todayIST(new Date('2027-03-31T20:00:00Z'))).toBe('2027-04-01');
    expect(todayIST(new Date('2027-03-31T18:00:00Z'))).toBe('2027-03-31');
  });

  it('computes ranges', () => {
    expect(fyRange('2026-27')).toEqual({ start: '2026-04-01', end: '2027-03-31' });
    expect(monthRange('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(addDays('2027-03-25', 15)).toBe('2027-04-09');
  });
});

describe('invoice numbers', () => {
  it('formats LKA/2026-27/0001 within 16 characters', () => {
    const n = formatInvoiceNumber('LKA', '2026-27', 1);
    expect(n).toBe('LKA/2026-27/0001');
    expect(n.length).toBe(16);
    expect(formatInvoiceNumber('LKA', '2026-27', 9999)).toBe('LKA/2026-27/9999');
  });

  it('rejects invalid prefixes and sequences', () => {
    expect(() => formatInvoiceNumber('LKAX', '2026-27', 1)).toThrow();
    expect(() => formatInvoiceNumber('lk', '2026-27', 1)).toThrow();
    expect(() => formatInvoiceNumber('LKA', '2026-27', 0)).toThrow();
    expect(() => formatInvoiceNumber('LKA', '2026-27', 10000)).toThrow();
  });

  it('continues the sequence within a FY', () => {
    expect(nextInvoiceNumber('LKA', '2027-03-31', 41)).toEqual({
      fy: '2026-27',
      seq: 42,
      number: 'LKA/2026-27/0042',
    });
  });

  it('restarts at 0001 in a new FY (new counter document)', () => {
    // On 1 April the FY's counter doc does not exist yet -> counterLast = null.
    expect(nextInvoiceNumber('LKA', '2027-04-01', null)).toEqual({
      fy: '2027-28',
      seq: 1,
      number: 'LKA/2027-28/0001',
    });
  });

  it('builds safe PDF filenames', () => {
    expect(invoiceFileName('LKA/2026-27/0001', 'Sri Rama Traders / Siddipet')).toBe(
      'LKA-2026-27-0001_Sri-Rama-Traders-Siddipet.pdf',
    );
  });
});
