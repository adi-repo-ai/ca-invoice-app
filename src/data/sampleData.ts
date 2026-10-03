// "Load sample data" on the TEST site: made-up clients and invoices created
// through the normal app functions (so the security rules check every write,
// exactly as when a person uses the portal). Never shown on the live site.
import type { Firestore } from 'firebase/firestore';
import { todayIST } from '../lib/fy';
import type { FirmSettings } from '../lib/types';
import type { Actor } from './audit';
import { createClient, type ClientInput } from './clients';
import { cancelInvoice, clientSnapshot, createDraft, getInvoice, issueInvoice, recordPayment } from './invoices';

const CLIENTS: ClientInput[] = [
  ['Sri Rama Traders (TEST)', 'Ramesh', ['Business', 'GST']],
  ['Bengaluru Tech Pvt Ltd (TEST)', 'Accounts Team', ['Company', 'Audit']],
  ['Venkatesh Reddy (TEST)', '', ['Individual', 'ITR']],
  ['Siddipet Rice Mill (TEST)', 'Suresh', ['Business', 'GST', 'Accounting']],
  ['Lakshmi Textiles (TEST)', 'Lakshmi', ['Partnership', 'TDS']],
  ['Anjali Sharma (TEST)', '', ['Individual', 'ITR']],
].map(([name, contactPerson, tags], i) => ({
  name: name as string,
  contactPerson: contactPerson as string,
  email: `test.client${i + 1}@example.com`,
  whatsapp: `9190000000${i + 1}`,
  address: `${i + 1}-2-3 Sample Road\nSiddipet, Telangana`,
  stateName: 'Telangana',
  stateCode: '36',
  gstin: '',
  pan: '',
  tags: tags as string[],
  notes: 'Sample data for testing',
}));

// [client index, amount in rupees, what happens after issuing]
const PLAN: [number, number, 'PAID' | 'ISSUED' | 'CANCELLED' | 'DRAFT'][] = [
  [0, 25000, 'PAID'],
  [1, 60000, 'ISSUED'],
  [2, 3500, 'PAID'],
  [3, 18000, 'ISSUED'],
  [4, 12000, 'PAID'],
  [5, 3000, 'CANCELLED'],
  [1, 45000, 'PAID'],
  [3, 9000, 'ISSUED'],
  [0, 15000, 'DRAFT'],
  [5, 2500, 'DRAFT'],
];

export const SAMPLE_COUNTS = { clients: CLIENTS.length, invoices: PLAN.length };

export async function loadSampleData(
  db: Firestore,
  actor: Actor,
  settings: FirmSettings,
  onProgress: (text: string) => void,
): Promise<void> {
  const clientIds: string[] = [];
  for (const [i, c] of CLIENTS.entries()) {
    onProgress(`Adding client ${i + 1} of ${CLIENTS.length}…`);
    clientIds.push(await createClient(db, actor.uid, c));
  }
  const today = todayIST();
  for (const [i, [ci, rupees, outcome]] of PLAN.entries()) {
    onProgress(`Creating invoice ${i + 1} of ${PLAN.length}…`);
    const sac = settings.sacCodes[i % settings.sacCodes.length];
    const id = await createDraft(
      db,
      actor,
      {
        clientId: clientIds[ci],
        client: clientSnapshot({ ...CLIENTS[ci], nameLower: CLIENTS[ci].name.toLowerCase() }),
        items: [{ description: sac.description, sac: sac.code, qty: 1, ratePaise: rupees * 100 }],
        reimbursements: [],
        terms: settings.defaultTerms,
        notes: 'Sample invoice for testing',
      },
      settings,
    );
    if (outcome === 'DRAFT') continue;
    await issueInvoice(db, actor, id, settings);
    if (outcome === 'ISSUED') continue;
    const inv = (await getInvoice(db, id))!;
    if (outcome === 'PAID') {
      await recordPayment(db, actor, inv, { date: today, mode: 'UPI', amountPaise: inv.totals.grandTotalPaise, tdsPaise: 0, reference: `TEST-UTR-${i + 1}` });
    } else {
      await cancelInvoice(db, actor, inv, 'Sample: wrong client selected');
    }
  }
}
