import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDraft, getInvoice, issueInvoice } from '../../src/data/invoices';
import { fyForDate, todayIST } from '../../src/lib/fy';
import { SETTINGS, STAFF, asStaff, draftInput, fs, makeEnv, seed } from './helpers';

let env: RulesTestEnvironment;
const fy = fyForDate(todayIST());

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

describe('invoice numbering', () => {
  it('assigns sequential numbers per FY and computes GST correctly', async () => {
    const db = fs(asStaff(env));
    const ts = await createDraft(db, STAFF, draftInput('ts'), SETTINGS);
    const ka = await createDraft(db, STAFF, draftInput('ka'), SETTINGS);
    expect(await issueInvoice(db, STAFF, ts, SETTINGS)).toBe(`LKA/${fy}/0001`);
    expect(await issueInvoice(db, STAFF, ka, SETTINGS)).toBe(`LKA/${fy}/0002`);

    const tsInv = (await getInvoice(db, ts))!;
    expect(tsInv.taxType).toBe('INTRA');
    expect(tsInv.totals.cgstPaise).toBe(900_00);
    expect(tsInv.totals.sgstPaise).toBe(900_00);
    expect(tsInv.totals.igstPaise).toBe(0);
    expect(tsInv.totals.reimbursementsPaise).toBe(500_00);
    expect(tsInv.totals.grandTotalPaise).toBe(10_000_00 + 1_800_00 + 500_00);

    const kaInv = (await getInvoice(db, ka))!;
    expect(kaInv.taxType).toBe('INTER');
    expect(kaInv.totals.igstPaise).toBe(1_800_00);
    expect(kaInv.totals.cgstPaise + kaInv.totals.sgstPaise).toBe(0);
  });

  it('cannot issue the same draft twice', async () => {
    const db = fs(asStaff(env));
    const id = await createDraft(db, STAFF, draftInput(), SETTINGS);
    await issueInvoice(db, STAFF, id, SETTINGS);
    await expect(issueInvoice(db, STAFF, id, SETTINGS)).rejects.toThrow(/Only drafts/);
  });

  it('survives concurrent issuing by several users without gaps or duplicates', async () => {
    const N = 10;
    const ids: string[] = [];
    const db0 = fs(asStaff(env));
    for (let i = 0; i < N; i++) ids.push(await createDraft(db0, STAFF, draftInput(i % 2 ? 'ka' : 'ts'), SETTINGS));

    // Each issue runs from a different signed-in staff member, all at once.
    const numbers = await Promise.all(
      ids.map((id, i) => {
        const n = i + 2;
        const actor = { uid: `staff-${n}`, email: `staff${n}@example.com` };
        return issueInvoice(fs(asStaff(env, n)), actor, id, SETTINGS);
      }),
    );
    const expected = Array.from({ length: N }, (_, i) => `LKA/${fy}/${String(i + 1).padStart(4, '0')}`);
    expect([...numbers].sort()).toEqual(expected);
    expect(new Set(numbers).size).toBe(N);

    const counter = await getDoc(doc(db0, 'counters', fy));
    expect(counter.data()?.last).toBe(N);
  });
});
