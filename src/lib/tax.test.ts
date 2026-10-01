import { describe, expect, it } from 'vitest';
import { computeInvoice, lineAmount, taxTypeFor } from './tax';

const base = { gstRateBp: 1800, firmStateCode: '36', reimbursements: [] };

describe('tax engine', () => {
  it('Telangana client gets CGST 9% + SGST 9%', () => {
    const r = computeInvoice({
      ...base,
      clientStateCode: '36',
      items: [{ description: 'Audit fee', sac: '998221', qty: 1, ratePaise: 10_000_00 }],
    });
    expect(r.taxType).toBe('INTRA');
    expect(r.totals.cgstPaise).toBe(900_00);
    expect(r.totals.sgstPaise).toBe(900_00);
    expect(r.totals.igstPaise).toBe(0);
    expect(r.totals.grandTotalPaise).toBe(11_800_00);
  });

  it('out-of-state client gets IGST 18%', () => {
    const r = computeInvoice({
      ...base,
      clientStateCode: '29',
      items: [{ description: 'Tax filing', sac: '998231', qty: 2, ratePaise: 2_500_00 }],
    });
    expect(r.taxType).toBe('INTER');
    expect(r.totals.taxablePaise).toBe(5_000_00);
    expect(r.totals.igstPaise).toBe(900_00);
    expect(r.totals.cgstPaise + r.totals.sgstPaise).toBe(0);
    expect(r.totals.grandTotalPaise).toBe(5_900_00);
  });

  it('reimbursements carry no tax', () => {
    const r = computeInvoice({
      ...base,
      clientStateCode: '36',
      items: [{ description: 'ROC filing', sac: '998222', qty: 1, ratePaise: 1_000_00 }],
      reimbursements: [{ description: 'MCA fees paid', amountPaise: 600_00 }],
    });
    expect(r.totals.taxPaise).toBe(180_00);
    expect(r.totals.reimbursementsPaise).toBe(600_00);
    expect(r.totals.grandTotalPaise).toBe(1_000_00 + 180_00 + 600_00);
  });

  it('rounds grand total to the nearest rupee and records the round-off', () => {
    const r = computeInvoice({
      ...base,
      clientStateCode: '27',
      items: [{ description: 'x', sac: '998221', qty: 1, ratePaise: 333_33 }],
    });
    // 333.33 + 60.00 (IGST 59.9994 -> 60.00) = 393.33 -> 393.00
    expect(r.totals.igstPaise).toBe(60_00);
    expect(r.totals.grandTotalPaise).toBe(393_00);
    expect(r.totals.roundOffPaise).toBe(-33);
    expect(r.amountInWords).toBe('Rupees Three Hundred Ninety-Three Only');
  });

  it('respects an edited GST rate', () => {
    const r = computeInvoice({
      ...base,
      gstRateBp: 1200,
      clientStateCode: '36',
      items: [{ description: 'x', sac: '998221', qty: 1, ratePaise: 100_00 }],
    });
    expect(r.totals.cgstPaise).toBe(6_00);
    expect(r.totals.sgstPaise).toBe(6_00);
  });

  it('computes fractional quantities in integer paise', () => {
    expect(lineAmount(1.5, 1_000_01)).toBe(1_500_02); // 1500.015 -> 1500.02
    expect(lineAmount(0.1, 3)).toBe(0);
    expect(Number.isInteger(lineAmount(2.33, 99_99))).toBe(true);
  });

  it('rejects float money', () => {
    expect(() => lineAmount(1, 10.5)).toThrow();
  });

  it('chooses tax type by state code', () => {
    expect(taxTypeFor('36', '36')).toBe('INTRA');
    expect(taxTypeFor('36', '37')).toBe('INTER');
  });
});
