// Seed the LOCAL emulators with an ADMIN, default firm settings and two sample
// clients (one in Telangana, one out of state). Refuses to touch anything but
// the emulators / a demo-* project.
//
//   npm run emulators        (terminal 1)
//   npm run seed:emulator    (terminal 2)
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, usingEmulators } from '../netlify/functions/_shared/admin';
import { DEFAULT_SETTINGS } from '../src/lib/defaults';
import { loadDotEnv } from './env';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin12345';

async function main() {
  loadDotEnv();
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_PROJECT_ID ||= 'demo-lka-invoices';
  if (!usingEmulators() || !process.env.FIREBASE_PROJECT_ID.startsWith('demo-')) {
    throw new Error('seed-emulator only runs against the emulators with a demo-* project id');
  }
  const auth = adminAuth();
  const db = adminDb();

  let uid: string;
  try {
    uid = (await auth.getUserByEmail(ADMIN_EMAIL)).uid;
  } catch {
    uid = (await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: 'Demo Admin' })).uid;
  }
  await auth.setCustomUserClaims(uid, { role: 'ADMIN', fin: true, pay: true });
  const now = FieldValue.serverTimestamp();
  await db.doc(`users/${uid}`).set({
    email: ADMIN_EMAIL, displayName: 'Demo Admin', role: 'ADMIN', fin: true, pay: true, disabled: false,
    createdAt: now, createdBy: 'seed', updatedAt: now, updatedBy: 'seed',
  });

  await db.doc('settings/firm').set({
    ...DEFAULT_SETTINGS,
    name: 'Demo Chartered Accountants',
    address: '1-2-3 Main Road\nSiddipet, Telangana 502103',
    phone: '+91 90000 00000',
    email: 'accounts@example.com',
    website: 'example.com',
    gstin: '36AABCD1234E1Z5',
    pan: 'AABCD1234E',
    bank: { accountName: 'Demo Chartered Accountants', accountNumber: '000111222333', ifsc: 'SBIN0000001', branch: 'Siddipet', upiId: 'demo@upi' },
    updatedAt: now,
    updatedBy: uid,
  });

  const clients = [
    { id: 'demo-telangana', name: 'Sri Rama Traders', stateName: 'Telangana', stateCode: '36', gstin: '36AAAFS1234K1Z2', whatsapp: '919876543210', email: 'rama@example.com' },
    { id: 'demo-karnataka', name: 'Bengaluru Tech Pvt Ltd', stateName: 'Karnataka', stateCode: '29', gstin: '29AABCB5678L1Z9', whatsapp: '919812345678', email: 'accounts@bt.example.com' },
  ];
  for (const c of clients) {
    const { id, ...rest } = c;
    await db.doc(`clients/${id}`).set({
      ...rest,
      nameLower: rest.name.toLowerCase(),
      contactPerson: 'Accounts Team',
      address: 'Sample address',
      pan: rest.gstin.slice(2, 12),
      createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid,
    });
  }
  console.log(`✔ Seeded. Log in with ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
