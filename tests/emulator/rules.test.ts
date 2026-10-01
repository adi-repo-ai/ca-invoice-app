import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '../../src/data/clients';
import {
  cancelInvoice,
  createDraft,
  getInvoice,
  issueInvoice,
  recordPayment,
  updateDraft,
} from '../../src/data/invoices';
import { saveSettings } from '../../src/data/settings';
import { fyForDate, todayIST } from '../../src/lib/fy';
import {
  ADMIN,
  NOROLE,
  SETTINGS,
  STAFF,
  TS_CLIENT,
  asAdmin,
  asNoRole,
  asStaff,
  draftInput,
  fs,
  makeEnv,
  seed,
} from './helpers';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await makeEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
});

const PAYMENT = { date: todayIST(), mode: 'UPI' as const, amountPaise: 11_800_00, tdsPaise: 0, reference: 'UTR1' };

async function issuedInvoice() {
  const db = fs(asStaff(env));
  const id = await createDraft(db, STAFF, draftInput('ts'), SETTINGS);
  await issueInvoice(db, STAFF, id, SETTINGS);
  return (await getInvoice(db, id))!;
}

describe('signed-out users', () => {
  it('cannot read or write anything', async () => {
    const db = fs(env.unauthenticatedContext());
    await assertFails(getDoc(doc(db, 'settings/firm')));
    await assertFails(getDoc(doc(db, 'clients/ts')));
    await assertFails(getDocs(collection(db, 'invoices')));
    await assertFails(getDocs(collection(db, 'auditLog')));
    await assertFails(getDoc(doc(db, 'counters/2026-27')));
    await assertFails(setDoc(doc(db, 'clients/x'), { name: 'x' }));
    await assertFails(setDoc(doc(db, 'anything/else'), { a: 1 }));
  });
});

describe('signed-in users without a role claim', () => {
  it('are denied everything', async () => {
    const db = fs(asNoRole(env));
    await assertFails(getDoc(doc(db, 'settings/firm')));
    await assertFails(getDocs(collection(db, 'clients')));
    await assertFails(getDocs(collection(db, 'invoices')));
    await assertFails(createClient(db, NOROLE.uid, { ...TS_CLIENT }));
  });
});

describe('firm settings', () => {
  it('STAFF can read but not write', async () => {
    const db = fs(asStaff(env));
    await assertSucceeds(getDoc(doc(db, 'settings/firm')));
    await assertFails(saveSettings(db, STAFF.uid, { ...SETTINGS, name: 'Hacked' }));
  });

  it('ADMIN can write valid settings', async () => {
    const db = fs(asAdmin(env));
    await assertSucceeds(saveSettings(db, ADMIN.uid, { ...SETTINGS, brandColor: '#123456' }));
  });

  it('rejects an oversized logo and bad values', async () => {
    const db = fs(asAdmin(env));
    const big = 'data:image/png;base64,' + 'A'.repeat(400_001);
    await assertFails(saveSettings(db, ADMIN.uid, { ...SETTINGS, logoDataUrl: big }));
    await assertFails(saveSettings(db, ADMIN.uid, { ...SETTINGS, brandColor: 'blue' }));
    await assertFails(saveSettings(db, ADMIN.uid, { ...SETTINGS, invoicePrefix: 'LKAX' }));
    await assertSucceeds(
      saveSettings(db, ADMIN.uid, { ...SETTINGS, logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
    );
  });
});

describe('users collection', () => {
  it('only ADMIN can list; nobody can write from the client', async () => {
    await assertFails(getDocs(collection(fs(asStaff(env)), 'users')));
    await assertSucceeds(getDoc(doc(fs(asStaff(env)), 'users', STAFF.uid))); // own profile
    await assertSucceeds(getDocs(collection(fs(asAdmin(env)), 'users')));
    await assertFails(setDoc(doc(fs(asAdmin(env)), 'users', 'x'), { role: 'ADMIN' }));
    await assertFails(updateDoc(doc(fs(asStaff(env)), 'users', STAFF.uid), { role: 'ADMIN' }));
  });
});

describe('clients', () => {
  it('STAFF can create and edit valid clients', async () => {
    const db = fs(asStaff(env));
    const id = await assertSucceeds(createClient(db, STAFF.uid, { ...TS_CLIENT, gstin: '36AABCU9603R1ZM' }));
    expect(id).toBeTruthy();
  });

  it('rejects malformed GSTIN / PAN and deletes', async () => {
    const db = fs(asStaff(env));
    await assertFails(createClient(db, STAFF.uid, { ...TS_CLIENT, gstin: '36AABCU9603R1Z' }));
    await assertFails(createClient(db, STAFF.uid, { ...TS_CLIENT, pan: 'ABC' }));
    await assertFails(deleteDoc(doc(db, 'clients/ts')));
  });
});

describe('invoices', () => {
  it('STAFF can create and edit a draft', async () => {
    const db = fs(asStaff(env));
    const id = await assertSucceeds(createDraft(db, STAFF, draftInput('ts'), SETTINGS));
    await assertSucceeds(updateDraft(db, STAFF, id, draftInput('ka'), SETTINGS));
  });

  it('a draft cannot carry a number or be created as ISSUED', async () => {
    const db = fs(asStaff(env));
    const id = await createDraft(db, STAFF, draftInput(), SETTINGS);
    await assertFails(updateDoc(doc(db, 'invoices', id), { number: 'LKA/2026-27/0001' }));
    const inv = (await getInvoice(db, id))!;
    const { id: _id, ...data } = inv;
    void _id;
    await assertFails(
      addDoc(collection(db, 'invoices'), {
        ...data,
        status: 'ISSUED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('issued invoices are read-only except status/payment fields', async () => {
    const inv = await issuedInvoice();
    const db = fs(asStaff(env));
    const ref = doc(db, 'invoices', inv.id);
    expect(inv.status).toBe('ISSUED');
    await assertFails(updateDoc(ref, { 'totals.grandTotalPaise': 1, updatedAt: serverTimestamp(), updatedBy: STAFF.uid }));
    await assertFails(updateDoc(ref, { number: 'LKA/2026-27/0099', updatedAt: serverTimestamp(), updatedBy: STAFF.uid }));
    await assertFails(updateDoc(ref, { status: 'DRAFT', updatedAt: serverTimestamp(), updatedBy: STAFF.uid }));
    await assertFails(updateDraft(db, STAFF, inv.id, draftInput(), SETTINGS));
    await assertFails(deleteDoc(ref));
  });

  it('STAFF can record payment; payment cannot smuggle other changes', async () => {
    const inv = await issuedInvoice();
    const db = fs(asStaff(env));
    await assertFails(
      updateDoc(doc(db, 'invoices', inv.id), {
        status: 'PAID',
        payment: PAYMENT,
        terms: 'changed',
        updatedAt: serverTimestamp(),
        updatedBy: STAFF.uid,
      }),
    );
    await assertSucceeds(recordPayment(db, STAFF, inv, PAYMENT));
    // PAID is final.
    await assertFails(recordPayment(db, STAFF, { ...inv, status: 'PAID' }, PAYMENT));
  });

  it('only ADMIN can cancel, and a reason is required', async () => {
    const inv = await issuedInvoice();
    await assertFails(cancelInvoice(fs(asStaff(env)), STAFF, inv, 'Wrong client'));
    await assertFails(cancelInvoice(fs(asAdmin(env)), ADMIN, inv, '  '));
    await assertSucceeds(cancelInvoice(fs(asAdmin(env)), ADMIN, inv, 'Wrong client'));
    const after = (await getInvoice(fs(asAdmin(env)), inv.id))!;
    expect(after.status).toBe('CANCELLED');
    expect(after.number).toBe(inv.number); // number stays reserved
    await assertFails(recordPayment(fs(asAdmin(env)), ADMIN, after, PAYMENT));
  });
});

describe('invoice counters', () => {
  it('cannot be written directly, rewound or deleted', async () => {
    const inv = await issuedInvoice();
    const db = fs(asAdmin(env));
    const ref = doc(db, 'counters', inv.fy!);
    await assertFails(setDoc(ref, { last: 5, lastInvoiceId: inv.id, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { last: 0, lastInvoiceId: inv.id, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(db, 'counters', '2099-00'), { last: 1, lastInvoiceId: inv.id, updatedAt: serverTimestamp() }));
  });

  it('an invoice cannot be issued with a skipped or reused number', async () => {
    const first = await issuedInvoice(); // seq 1
    const db = fs(asStaff(env));
    const id = await createDraft(db, STAFF, draftInput(), SETTINGS);
    const fy = fyForDate(todayIST());
    const issueWith = (seq: number) =>
      updateDoc(doc(db, 'invoices', id), {
        status: 'ISSUED',
        number: `LKA/${fy}/${String(seq).padStart(4, '0')}`,
        seq,
        fy,
        firm: {},
        issuedAt: serverTimestamp(),
        issuedBy: STAFF.uid,
        updatedAt: serverTimestamp(),
        updatedBy: STAFF.uid,
      });
    await assertFails(issueWith(1)); // reuse without counter bump
    await assertFails(issueWith(3)); // skip
    expect(first.seq).toBe(1);
  });
});

describe('audit log', () => {
  const entry = (uid: string, email: string, action = 'SEND_WHATSAPP') => ({
    invoiceId: 'inv1',
    invoiceNumber: null,
    action,
    uid,
    userEmail: email,
    at: serverTimestamp(),
    details: { channel: 'whatsapp' },
  });

  it('is append-only and cannot be spoofed', async () => {
    const db = fs(asStaff(env));
    const ref = await assertSucceeds(addDoc(collection(db, 'auditLog'), entry(STAFF.uid, STAFF.email)));
    await assertFails(addDoc(collection(db, 'auditLog'), entry(ADMIN.uid, ADMIN.email)));
    await assertFails(addDoc(collection(db, 'auditLog'), entry(STAFF.uid, STAFF.email, 'SEND_EMAIL')));
    await assertFails(updateDoc(ref, { action: 'EDIT' }));
    await assertFails(deleteDoc(ref));
    await assertFails(deleteDoc(doc(fs(asAdmin(env)), 'auditLog', ref.id)));
  });

  it('every invoice change writes an audit entry', async () => {
    const inv = await issuedInvoice();
    const snap = await getDocs(collection(fs(asStaff(env)), 'auditLog'));
    const actions = snap.docs.filter((d) => d.data().invoiceId === inv.id).map((d) => d.data().action);
    expect(actions.sort()).toEqual(['CREATE', 'ISSUE']);
  });
});
