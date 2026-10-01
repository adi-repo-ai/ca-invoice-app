import { DEFAULT_LOGO_DATA_URL } from './defaultLogo';
import type { FirmSettings } from './types';

// Starting values (from the firm's visiting card), used until an ADMIN saves
// Settings. Everything here can be edited later in Settings → Firm details.
// GSTIN, PAN and bank/UPI details are not on the card, so they start blank.
export const DEFAULT_BRAND_COLOR = '#0c629b';

export const DEFAULT_SETTINGS: FirmSettings = {
  name: 'Lingeshwar Kaparthi & Associates',
  tagline: 'Chartered Accountants',
  proprietor: 'CA Lingeshwar, ACA',
  address: '7-1-59, Subhash Road,\nOpp. to Sri Vaibhavam Shopping Mall,\nSiddipet, Telangana - 502103',
  stateName: 'Telangana',
  stateCode: '36',
  phone: '+91 62817 92541',
  email: 'ca.Lingeshwar@gmail.com',
  website: '',
  gstin: '',
  pan: '',
  bank: { accountName: '', accountNumber: '', ifsc: '', branch: '', upiId: '' },
  defaultTerms:
    'Payment is due within 15 days of the invoice date.\nPlease quote the invoice number when making payment.',
  brandColor: DEFAULT_BRAND_COLOR,
  logoDataUrl: DEFAULT_LOGO_DATA_URL,
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
