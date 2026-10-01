import { beforeAll, describe, expect, it } from 'vitest';
import { clearAuth, idTokenFor, post } from './fn-helpers';
import { adminAuth, adminDb } from '../../netlify/functions/_shared/admin';
import handler, { currentFy } from '../../netlify/functions/reset-numbering';
import { fyForDate, todayIST } from '../../src/lib/fy';

let adminToken: string;
let staffToken: string;

beforeAll(async () => {
  await clearAuth();
  const auth = adminAuth();
  const admin = await auth.createUser({ email: 'boss@example.com', password: 'boss12345' });
  await auth.setCustomUserClaims(admin.uid, { role: 'ADMIN' });
  const staff = await auth.createUser({ email: 'clerk@example.com', password: 'clerk12345' });
  await auth.setCustomUserClaims(staff.uid, { role: 'STAFF' });
  adminToken = await idTokenFor('boss@example.com', 'boss12345');
  staffToken = await idTokenFor('clerk@example.com', 'clerk12345');
});

describe('reset-numbering function', () => {
  it('uses the same financial year as the app', () => {
    expect(currentFy()).toBe(fyForDate(todayIST()));
  });

  it('only an ADMIN can reset, and only once no numbered invoice of the year is left', async () => {
    const db = adminDb();
    const fy = currentFy();
    await db.doc(`counters/${fy}`).set({ last: 3, lastInvoiceId: 'i3', updatedAt: new Date() });
    await db.doc('invoices/i3').set({ fy, seq: 3, status: 'CANCELLED' });
    await db.doc('invoices/d1').set({ status: 'DRAFT' }); // drafts don't block a reset

    expect((await handler(post('reset-numbering', {}))).status).toBe(401);
    expect((await handler(post('reset-numbering', {}, staffToken))).status).toBe(403);

    const blocked = await handler(post('reset-numbering', {}, adminToken));
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: string }).error).toContain('1 numbered invoice');
    expect((await db.doc(`counters/${fy}`).get()).exists).toBe(true);

    await db.doc('invoices/i3').delete();
    const ok = await handler(post('reset-numbering', {}, adminToken));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ fy, previousLast: 3 });
    expect((await db.doc(`counters/${fy}`).get()).exists).toBe(false); // next invoice is 0001

    await db.doc('invoices/d1').delete();
  });
});
