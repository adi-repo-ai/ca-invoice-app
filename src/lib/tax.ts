// GST tax engine. Everything is integer paise.
import { roundHalfUp } from './money';
import { amountInWords } from './words';
import type { InvoiceTotals, LineItem, Reimbursement, TaxType } from './types';

export interface LineInput {
  description: string;
  sac: string;
  qty: number;
  ratePaise: number;
}

/** amount = qty × rate, qty allowed to 2 decimal places. */
export function lineAmount(qty: number, ratePaise: number): number {
  if (!Number.isInteger(ratePaise)) throw new Error('rate must be integer paise');
  const qtyHundredths = Math.round(qty * 100);
  return roundHalfUp((qtyHundredths * ratePaise) / 100);
}

/** Intra-state (same state code as the firm) => CGST + SGST, else IGST. */
export function taxTypeFor(firmStateCode: string, clientStateCode: string, chargeGst = true): TaxType {
  if (!chargeGst) return 'NONE';
  return firmStateCode === clientStateCode ? 'INTRA' : 'INTER';
}

export interface ComputeInput {
  items: LineInput[];
  reimbursements: Reimbursement[];
  gstRateBp: number; // 1800 = 18%
  firmStateCode: string;
  clientStateCode: string;
  chargeGst?: boolean; // default true; false = no GST at all
}

export interface ComputeResult {
  items: LineItem[];
  reimbursements: Reimbursement[];
  taxType: TaxType;
  totals: InvoiceTotals;
  amountInWords: string;
}

export function computeInvoice(input: ComputeInput): ComputeResult {
  const { gstRateBp } = input;
  if (!Number.isInteger(gstRateBp) || gstRateBp < 0 || gstRateBp > 10000) {
    throw new Error('invalid GST rate');
  }
  const items: LineItem[] = input.items.map((it) => ({
    description: it.description,
    sac: it.sac,
    qty: it.qty,
    ratePaise: it.ratePaise,
    amountPaise: lineAmount(it.qty, it.ratePaise),
  }));
  const reimbursements = input.reimbursements.map((r) => {
    if (!Number.isInteger(r.amountPaise)) throw new Error('reimbursement must be integer paise');
    return { description: r.description, amountPaise: r.amountPaise };
  });

  const taxablePaise = items.reduce((s, i) => s + i.amountPaise, 0);
  const reimbursementsPaise = reimbursements.reduce((s, r) => s + r.amountPaise, 0);
  const taxType = taxTypeFor(input.firmStateCode, input.clientStateCode, input.chargeGst ?? true);

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (taxType === 'INTRA') {
    // Half the rate each, rounded independently (as shown on the invoice).
    cgstPaise = roundHalfUp((taxablePaise * gstRateBp) / 20000);
    sgstPaise = cgstPaise;
  } else if (taxType === 'INTER') {
    igstPaise = roundHalfUp((taxablePaise * gstRateBp) / 10000);
  }
  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  const exact = taxablePaise + taxPaise + reimbursementsPaise;
  const grandTotalPaise = roundHalfUp(exact / 100) * 100; // nearest rupee
  const roundOffPaise = grandTotalPaise - exact;

  return {
    items,
    reimbursements,
    taxType,
    totals: {
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      taxPaise,
      reimbursementsPaise,
      roundOffPaise,
      grandTotalPaise,
    },
    amountInWords: amountInWords(Math.max(0, grandTotalPaise)),
  };
}
