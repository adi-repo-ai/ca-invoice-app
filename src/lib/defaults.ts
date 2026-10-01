import type { FirmSettings } from './types';

// Defaults used until an ADMIN saves the firm settings. Firm-specific details
// (name, address, GSTIN, bank…) are intentionally blank: they are entered in
// Settings, never hardcoded.
export const DEFAULT_BRAND_COLOR = '#1a3a5c';

export const DEFAULT_SETTINGS: FirmSettings = {
  name: '',
  tagline: '',
  proprietor: '',
  address: '',
  stateName: 'Telangana',
  stateCode: '36',
  phone: '',
  email: '',
  website: '',
  gstin: '',
  pan: '',
  bank: { accountName: '', accountNumber: '', ifsc: '', branch: '', upiId: '' },
  defaultTerms:
    'Payment is due within 15 days of the invoice date.\nPlease quote the invoice number when making payment.',
  brandColor: DEFAULT_BRAND_COLOR,
  logoDataUrl: null,
  gstRateBp: 1800,
  sacCodes: [
    { code: '998221', description: 'Financial auditing services' },
    { code: '998222', description: 'Accounting and bookkeeping services' },
    { code: '998231', description: 'Corporate tax consulting and preparation services' },
    { code: '998232', description: 'Individual tax preparation and planning services' },
    { code: '998311', description: 'Management consulting and management services' },
  ],
  invoicePrefix: 'LKA',
  paymentDueDays: 15,
};

/** Merge a (possibly partial / older) settings doc with defaults. */
export function withDefaults(raw: Partial<FirmSettings> | undefined): FirmSettings {
  const r = raw ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    bank: { ...DEFAULT_SETTINGS.bank, ...(r.bank ?? {}) },
    sacCodes: r.sacCodes ?? DEFAULT_SETTINGS.sacCodes,
  };
}
