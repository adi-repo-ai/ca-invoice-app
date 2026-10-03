// Load made-up sample data into a TEST Firebase project (e.g. ca-invoice-app-staging),
// so the staging site has clients, invoices and logins to try every screen with.
//
//   Test project:  npm run seed:test -- --owner you@gmail.com --password 'Test12345' --live
//   Emulator:      npm run seed:test -- --owner admin@example.com --password 'Test12345'
//
// Safety: refuses unless the project id contains "staging", "test" or starts with
// "demo-", so it can never write to the live project. Uses FIREBASE_PROJECT_ID /
// FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY from the environment or ./.env.
//
// What it adds:
// - firm settings for a "Demo" firm (only if none are saved yet)
// - 6 sample clients and ~18 invoices over the last six months (paid, unpaid,
//   overdue, one cancelled, one draft), numbered like real ones
// - with --password: two extra logins to test the other access levels:
//   adminb.test@example.com (Admin · no revenue, no payments) and
//   staff.test@example.com (Staff · with payments)
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb, usingEmulators } from '../netlify/functions/_shared/admin';
import { clientSnapshot, firmSnapshot } from '../src/data/invoices';
import { DEFAULT_SETTINGS, withDefaults } from '../src/lib/defaults';
import { addDays, formatInvoiceNumber, fyForDate, todayIST } from '../src/lib/fy';
import { computeInvoice } from '../src/lib/tax';
import type { Client, FirmSettings } from '../src/lib/types';
import { arg, flag, loadDotEnv } from './env';

const CLIENTS: (Client & { id: string })[] = [
  ['test-c1', 'Sri Rama Traders', 'Ramesh', '36', 'Telangana', ['Business', 'GST']],
  ['test-c2', 'Bengaluru Tech Pvt Ltd', 'Accounts Team', '29', 'Karnataka', ['Company', 'Audit']],
  ['test-c3', 'Venkatesh Reddy', '', '36', 'Telangana', ['Individual', 'ITR']],
  ['test-c4', 'Siddipet Rice Mill', 'Suresh', '36', 'Telangana', ['Business', 'GST', 'Accounting']],
  ['test-c5', 'Lakshmi Textiles', 'Lakshmi', '36', 'Telangana', ['Partnership', 'TDS']],
  ['test-c6', 'Anjali Sharma', '', '36', 'Telangana', ['Individual', 'ITR']],
].map(([id, name, contactPerson, stateCode, stateName, tags], i) => ({
  id: id as string,
  name: name as string,
  nameLower: (name as string).toLowerCase(),
  contactPerson: contactPerson as string,
  email: `test.client${i + 1}@example.com`,
  whatsapp: `9190000000${i + 1}`,
  address: `${i + 1}-2-3 Sample Road\n${stateName}`,
  stateName: stateName as string,
  stateCode: stateCode as string,
  gstin: '',
  pan: '',
  tags: tags as string[],
  notes: i === 0 ? 'TEST DATA. Prefers WhatsApp.' : 'TEST DATA',
}));

// [client index, days before today, amount in rupees, status, paid after N days]
const PLAN: [number, number, number, 'ISSUED' | 'PAID' | 'CANCELLED', number?][] = [
  [0, 175, 25000, 'PAID', 12], [1, 165, 60000, 'PAID', 30], [2, 150, 3500, 'PAID', 5],
  [3, 140, 18000, 'PAID', 20], [4, 125, 12000, 'PAID', 15], [5, 115, 3000, 'PAID', 3],
  [0, 100, 25000, 'PAID', 10], [1, 90, 45000, 'PAID', 40], [3, 80, 18000, 'ISSUED'],
  [2, 70, 4000, 'CANCELLED'], [4, 60, 15000, 'PAID', 9], [0, 45, 25000, 'PAID', 14],
  [5, 38, 3500, 'ISSUED'], [1, 30, 75000, 'ISSUED'], [3, 20, 18000, 'PAID', 12],
  [4, 12, 9000, 'ISSUED'], [0, 6, 25000, 'PAID', 4], [2, 2, 5000, 'ISSUED'],
];

async function main() {
  loadDotEnv();
  const live = flag('live');
  if (live) {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
  } else if (!usingEmulators()) {
    throw new Error('No emulator configured. Pass --live to load test data into the TEST project.');
  }
  const project = process.env.FIREBASE_PROJECT_ID ?? '';
  if (!/staging|test/i.test(project) && !project.startsWith('demo-')) {
    throw new Error(`Refusing to load test data into "${project}". The project id must contain "staging" or "test".`);
  }
  const ownerEmail = arg('owner')?.trim().toLowerCase();
  const password = arg('password');
  if (!ownerEmail) throw new Error('Usage: npm run seed:test -- --owner OWNER_EMAIL [--password TEST_LOGIN_PASSWORD] [--live]');
  if (password !== undefined && password.length < 8) throw new Error('--password must be at least 8 characters');
  console.log(`Target: ${live ? 'TEST project' : 'EMULATOR'} "${project}"`);

  const auth = adminAuth();
  const db = adminDb();
  const owner = await auth.getUserByEmail(ownerEmail).catch(() => null);
  if (!owner || owner.customClaims?.role !== 'ADMIN') {
    throw new Error(`${ownerEmail} must already be an ADMIN of this project (use the setup code or npm run create-admin first).`);
  }
  const uid = owner.uid;
  const today = todayIST();

  // Firm settings: keep any that were already saved.
  const settingsRef = db.doc('settings/firm');
  const saved = await settingsRef.get();
  if (!saved.exists) {
    await settingsRef.set({
      ...DEFAULT_SETTINGS,
      name: 'Demo Chartered Accountants (TEST)',
      address: '1-2-3 Main Road\nSiddipet, Telangana 502103',
      phone: '+91 90000 00000',
      email: 'accounts@example.com',
      bank: { accountName: 'Demo Chartered Accountants', accountNumber: '000111222333', ifsc: 'SBIN0000001', branch: 'Siddipet', upiId: 'demo@upi' },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
  }
  const settings: FirmSettings = withDefaults((await settingsRef.get()).data() as Partial<FirmSettings>);

  // Never mix with invoices that are already numbered in these financial years.
  const fys = new Set(PLAN.map(([, ago]) => fyForDate(addDays(today, -ago))));
  for (const fy of fys) {
    if ((await db.doc(`counters/${fy}`).get()).exists) {
      throw new Error(`Invoices are already numbered for ${fy} in this project, so test data was not added. Delete them first (Invoices → Delete all, then Settings → Invoice numbering) to reload.`);
    }
  }

  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  for (const { id, ...c } of CLIENTS) {
    batch.set(db.doc(`clients/${id}`), { ...c, createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid });
  }

  const seqByFy = new Map<string, number>();
  const lastIdByFy = new Map<string, string>();
  PLAN.forEach(([ci, ago, rupees, status, paidAfter], i) => {
    const date = addDays(today, -ago);
    const fy = fyForDate(date);
    const seq = (seqByFy.get(fy) ?? 0) + 1;
    seqByFy.set(fy, seq);
    const c = CLIENTS[ci];
    const sac = settings.sacCodes[i % settings.sacCodes.length];
    const r = computeInvoice({
      items: [{ description: sac.description, sac: sac.code, qty: 1, ratePaise: rupees * 100 }],
      reimbursements: [],
      gstRateBp: settings.gstRateBp,
      firmStateCode: settings.stateCode,
      clientStateCode: c.stateCode,
      chargeGst: settings.chargeGst,
    });
    const number = formatInvoiceNumber(settings.invoicePrefix, fy, seq);
    const id = `test-inv-${i + 1}`;
    lastIdByFy.set(fy, id);
    const ts = Timestamp.fromDate(new Date(`${date}T10:00:00+05:30`));
    const doc: Record<string, unknown> = {
      status, clientId: c.id, client: clientSnapshot(c),
      items: r.items, reimbursements: r.reimbursements, gstRateBp: settings.chargeGst ? settings.gstRateBp : 0,
      taxType: r.taxType, totals: r.totals, amountInWords: r.amountInWords,
      terms: settings.defaultTerms, notes: '', includeSignature: true,
      invoiceDate: date, dueDate: addDays(date, settings.paymentDueDays),
      number, seq, fy, firm: firmSnapshot(settings),
      createdAt: ts, createdBy: uid, updatedAt: ts, updatedBy: uid, issuedAt: ts, issuedBy: uid,
    };
    if (status === 'PAID') {
      doc.payment = { date: addDays(date, paidAfter!), mode: 'UPI', amountPaise: r.totals.grandTotalPaise, tdsPaise: 0, reference: `TESTUTR${i + 1}` };
    }
    if (status === 'CANCELLED') Object.assign(doc, { cancelReason: 'Test: wrong client selected', cancelledAt: ts, cancelledBy: uid });
    batch.set(db.doc(`invoices/${id}`), doc);
    const log = (action: string, at: Timestamp, details: Record<string, unknown> = {}) =>
      batch.set(db.collection('auditLog').doc(), { invoiceId: id, invoiceNumber: number, action, uid, userEmail: ownerEmail, at, details });
    log('ISSUE', ts);
    if (status === 'PAID') log('PAYMENT', Timestamp.fromDate(new Date(`${addDays(date, paidAfter!)}T15:00:00+05:30`)), { amountPaise: r.totals.grandTotalPaise });
    if (status === 'CANCELLED') log('CANCEL', ts, { reason: 'Test: wrong client selected' });
  });
  for (const [fy, last] of seqByFy) {
    batch.set(db.doc(`counters/${fy}`), { last, lastInvoiceId: lastIdByFy.get(fy), updatedAt: now });
  }

  // One old draft, to see the "finish or delete" nudge.
  const draftDate = addDays(today, -12);
  const draft = computeInvoice({
    items: [{ description: 'Individual tax preparation', sac: '998232', qty: 1, ratePaise: 2500_00 }],
    reimbursements: [], gstRateBp: settings.gstRateBp, firmStateCode: settings.stateCode, clientStateCode: '36', chargeGst: settings.chargeGst,
  });
  batch.set(db.doc('invoices/test-draft'), {
    status: 'DRAFT', clientId: CLIENTS[5].id, client: clientSnapshot(CLIENTS[5]),
    items: draft.items, reimbursements: [], gstRateBp: settings.chargeGst ? settings.gstRateBp : 0, taxType: draft.taxType,
    totals: draft.totals, amountInWords: draft.amountInWords, terms: settings.defaultTerms, notes: '', includeSignature: true,
    invoiceDate: draftDate, dueDate: addDays(draftDate, settings.paymentDueDays),
    createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid,
  });
  await batch.commit();
  console.log(`✔ Added ${CLIENTS.length} test clients, ${PLAN.length} invoices and 1 draft.`);

  // Optional logins for the other two access levels.
  if (password) {
    const logins = [
      { email: 'adminb.test@example.com', name: 'Test Admin B', role: 'ADMIN', fin: false, pay: false },
      { email: 'staff.test@example.com', name: 'Test Staff', role: 'STAFF', fin: false, pay: true },
    ] as const;
    for (const l of logins) {
      const existing = await auth.getUserByEmail(l.email).catch(() => null);
      const u = existing ?? (await auth.createUser({ email: l.email, password, displayName: l.name }));
      if (existing) await auth.updateUser(u.uid, { password });
      await auth.setCustomUserClaims(u.uid, { role: l.role, fin: l.fin, pay: l.pay });
      await db.doc(`users/${u.uid}`).set(
        { email: l.email, displayName: l.name, role: l.role, fin: l.fin, pay: l.pay, disabled: false, createdAt: now, createdBy: 'seed-test-data', updatedAt: now, updatedBy: 'seed-test-data' },
        { merge: true },
      );
      console.log(`✔ Login ${l.email} (${l.role === 'ADMIN' ? 'Admin · no revenue, no payments' : 'Staff · with payments'})`);
    }
    console.log('  Sign in with "Sign in with email & password" using the password you gave.');
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(`✖ ${(e as Error).message}`);
  process.exit(1);
});
