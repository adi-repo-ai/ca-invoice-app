// Shared domain types. All money is stored as integer paise.

export type Role = 'ADMIN' | 'STAFF';
export const ROLES: Role[] = ['ADMIN', 'STAFF'];

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
export type TaxType = 'INTRA' | 'INTER' | 'NONE'; // INTRA = CGST+SGST, INTER = IGST, NONE = GST not charged

/** A billable service: its SAC code, the default description and (optionally) a default price. */
export interface SacCode {
  code: string;
  description: string;
  ratePaise?: number; // default price; selecting the service fills this in
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  branch: string;
  upiId: string;
}

export interface FirmSettings {
  name: string;
  tagline: string; // e.g. "Chartered Accountants" (optional)
  proprietor: string; // e.g. "CA Lingeshwar, ACA" (optional)
  address: string;
  stateName: string;
  stateCode: string; // GST state code of the firm, e.g. "36" (Telangana)
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bank: BankDetails;
  defaultTerms: string;
  brandColor: string; // #rrggbb
  logoDataUrl: string | null; // base64 data URL, <= ~300 KB
  signatureDataUrl: string | null; // signature image (data URL), printed on invoices
  signatoryName: string; // printed under the signature, e.g. "CA Lingeshwar"
  chargeGst: boolean; // false = plain "Invoice" with no GST; true = "Tax Invoice" with CGST/SGST/IGST
  gstRateBp: number; // GST rate in basis points, 1800 = 18%
  sacCodes: SacCode[];
  invoicePrefix: string; // 1–3 capital letters, e.g. "LKA"
  paymentDueDays: number; // due date = invoice date + N days
}

export interface Client {
  name: string;
  nameLower: string;
  contactPerson: string;
  email: string;
  whatsapp: string; // digits only, with country code, e.g. 919876543210
  address: string;
  stateName: string;
  stateCode: string;
  gstin: string; // '' when unregistered
  pan: string;
}

export interface LineItem {
  description: string;
  sac: string;
  qty: number; // up to 2 decimals
  ratePaise: number;
  amountPaise: number;
}

export interface Reimbursement {
  description: string;
  amountPaise: number;
}

export interface InvoiceTotals {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  reimbursementsPaise: number;
  roundOffPaise: number; // may be negative
  grandTotalPaise: number;
}

export type ClientSnapshot = Omit<Client, 'nameLower'>;

export interface FirmSnapshot {
  name: string;
  signatoryName?: string;
  tagline?: string;
  proprietor?: string;
  address: string;
  stateName: string;
  stateCode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
  bank: BankDetails;
}

export type PaymentMode = 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CASH' | 'OTHER';
export const PAYMENT_MODES: PaymentMode[] = ['BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH', 'OTHER'];

export interface Payment {
  date: string; // YYYY-MM-DD
  mode: PaymentMode;
  amountPaise: number; // amount actually received
  tdsPaise: number; // TDS deducted by the client
  reference: string;
}

export interface Invoice {
  status: InvoiceStatus;
  clientId: string;
  client: ClientSnapshot;
  items: LineItem[];
  reimbursements: Reimbursement[];
  gstRateBp: number;
  taxType: TaxType;
  totals: InvoiceTotals;
  amountInWords: string;
  terms: string;
  notes?: string; // free text printed on the invoice
  includeSignature?: boolean; // print the signature image from Settings
  invoiceDate: string; // YYYY-MM-DD (draft: date created; issued: date of issue)
  dueDate: string; // YYYY-MM-DD
  // Set when issued:
  number?: string;
  seq?: number;
  fy?: string;
  firm?: FirmSnapshot;
  issuedBy?: string;
  // Status changes after issue:
  payment?: Payment;
  cancelReason?: string;
  createdBy: string;
  updatedBy: string;
}

export type AuditAction =
  | 'CREATE'
  | 'EDIT'
  | 'ISSUE'
  | 'PAYMENT'
  | 'CANCEL'
  | 'DELETE'
  | 'SEND_EMAIL'
  | 'SEND_WHATSAPP';
