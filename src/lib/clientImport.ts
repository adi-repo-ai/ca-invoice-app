// Turn an uploaded CSV / Excel-exported sheet into client records.
import type { ClientInput } from '../data/clients';
import { CLIENT_TAGS } from './defaults';
import { parseCsv } from './csv';
import { INDIAN_STATES } from './states';
import { isValidEmail, isValidGstin, isValidPan, normaliseWhatsapp } from './validation';

export const CLIENT_CSV_HEADERS = ['Name', 'Contact person', 'Email', 'Mobile', 'Address', 'State', 'GSTIN', 'PAN', 'Tags'];

// Accept common header spellings.
const ALIASES: Record<string, keyof ClientInput | 'state'> = {
  name: 'name',
  'client name': 'name',
  'contact person': 'contactPerson',
  contact: 'contactPerson',
  email: 'email',
  'email id': 'email',
  mobile: 'whatsapp',
  phone: 'whatsapp',
  whatsapp: 'whatsapp',
  'mobile number': 'whatsapp',
  address: 'address',
  'billing address': 'address',
  state: 'state',
  gstin: 'gstin',
  gst: 'gstin',
  pan: 'pan',
  tags: 'tags',
};

export interface ImportResult {
  clients: ClientInput[];
  problems: string[]; // "Row 4: invalid GSTIN"
}

export function parseClientCsv(text: string, defaultStateCode = ''): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { clients: [], problems: ['The file is empty.'] };
  const header = rows[0].map((h) => ALIASES[h.trim().toLowerCase()]);
  if (!header.includes('name')) return { clients: [], problems: ['No "Name" column found. Use the template headings.'] };
  const clients: ClientInput[] = [];
  const problems: string[] = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (k: string) => (r[header.indexOf(k as never)] ?? '').trim();
    const name = get('name');
    if (!name) return problems.push(`Row ${line}: name is missing, skipped.`);
    const stateText = get('state').toLowerCase();
    const state =
      INDIAN_STATES.find((s) => s.name.toLowerCase() === stateText || s.code === stateText.padStart(2, '0')) ??
      INDIAN_STATES.find((s) => s.code === defaultStateCode);
    const gstin = get('gstin').toUpperCase().replace(/\s/g, '');
    const pan = get('pan').toUpperCase().replace(/\s/g, '');
    const email = get('email');
    const mobile = get('whatsapp');
    const wa = mobile ? normaliseWhatsapp(mobile) : '';
    const issues: string[] = [];
    if (gstin && !isValidGstin(gstin)) issues.push('invalid GSTIN');
    if (pan && !isValidPan(pan)) issues.push('invalid PAN');
    if (email && !isValidEmail(email)) issues.push('invalid email');
    if (mobile && !wa) issues.push('invalid mobile');
    if (issues.length) return problems.push(`Row ${line} (${name}): ${issues.join(', ')}, skipped.`);
    const tags = get('tags')
      .split(/[;|,/]/)
      .map((t) => CLIENT_TAGS.find((x) => x.toLowerCase() === t.trim().toLowerCase()))
      .filter((t): t is (typeof CLIENT_TAGS)[number] => Boolean(t));
    clients.push({
      name: name.slice(0, 200),
      contactPerson: get('contactPerson').slice(0, 200),
      email,
      whatsapp: wa ?? '',
      address: get('address').slice(0, 1000),
      stateName: state?.name ?? '',
      stateCode: state?.code ?? '',
      gstin,
      pan,
      tags: [...new Set(tags)],
      notes: '',
    });
  });
  return { clients, problems };
}
