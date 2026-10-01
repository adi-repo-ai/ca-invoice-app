import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { DEFAULT_SETTINGS } from '../../src/lib/defaults';
import type { Client, FirmSettings } from '../../src/lib/types';
import type { DraftInput } from '../../src/data/invoices';

export const PROJECT_ID = 'demo-lka-invoices';

export async function makeEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
}

export const ADMIN = { uid: 'admin-1', email: 'admin@example.com' };
export const STAFF = { uid: 'staff-1', email: 'staff@example.com' };
export const NOROLE = { uid: 'norole-1', email: 'nobody@example.com' };

export function asAdmin(env: RulesTestEnvironment): RulesTestContext {
  return env.authenticatedContext(ADMIN.uid, { role: 'ADMIN', email: ADMIN.email });
}
export function asStaff(env: RulesTestEnvironment, n = 1): RulesTestContext {
  return env.authenticatedContext(n === 1 ? STAFF.uid : `staff-${n}`, {
    role: 'STAFF',
    email: n === 1 ? STAFF.email : `staff${n}@example.com`,
  });
}
export function asNoRole(env: RulesTestEnvironment): RulesTestContext {
  return env.authenticatedContext(NOROLE.uid, { email: NOROLE.email });
}

/** The modular SDK accepts the compat instance returned by the test context. */
export const fs = (ctx: RulesTestContext) => ctx.firestore() as unknown as Firestore;

export const SETTINGS: FirmSettings = {
  ...DEFAULT_SETTINGS,
  name: 'Test Firm',
  gstin: '36AABCD1234E1Z5',
};

export const TS_CLIENT: Client = {
  name: 'Telangana Co',
  nameLower: 'telangana co',
  contactPerson: 'A',
  email: 'a@example.com',
  whatsapp: '919876543210',
  address: 'Siddipet',
  stateName: 'Telangana',
  stateCode: '36',
  gstin: '',
  pan: '',
};

export const KA_CLIENT: Client = { ...TS_CLIENT, name: 'Karnataka Co', nameLower: 'karnataka co', stateName: 'Karnataka', stateCode: '29' };

export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = fs(ctx);
    await setDoc(doc(db, 'settings/firm'), { ...SETTINGS, updatedBy: ADMIN.uid });
    await setDoc(doc(db, 'clients/ts'), TS_CLIENT);
    await setDoc(doc(db, 'clients/ka'), KA_CLIENT);
    await setDoc(doc(db, 'users', STAFF.uid), { email: STAFF.email, role: 'STAFF' });
  });
}

export function draftInput(clientId: 'ts' | 'ka' = 'ts'): DraftInput {
  const c = clientId === 'ts' ? TS_CLIENT : KA_CLIENT;
  const { nameLower: _n, ...snap } = c;
  void _n;
  return {
    clientId,
    client: snap,
    items: [{ description: 'Audit fee', sac: '998221', qty: 1, ratePaise: 10_000_00 }],
    reimbursements: [{ description: 'ROC fee', amountPaise: 500_00 }],
    terms: 'Due in 15 days',
  };
}
