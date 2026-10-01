import { beforeAll, describe, expect, it } from 'vitest';
import { clearAuth, idTokenFor, post } from './fn-helpers';
import { adminAuth, adminDb } from '../../netlify/functions/_shared/admin';
import handler from '../../netlify/functions/admin-users';

let adminToken: string;
let staffToken: string;
let adminUid: string;

beforeAll(async () => {
  await clearAuth();
  const auth = adminAuth();
  adminUid = (await auth.createUser({ email: 'boss@example.com', password: 'boss12345' })).uid;
  await auth.setCustomUserClaims(adminUid, { role: 'ADMIN' });
  const staff = await auth.createUser({ email: 'clerk@example.com', password: 'clerk12345' });
  await auth.setCustomUserClaims(staff.uid, { role: 'STAFF' });
  adminToken = await idTokenFor('boss@example.com', 'boss12345');
  staffToken = await idTokenFor('clerk@example.com', 'clerk12345');
});

describe('admin-users function', () => {
  it('rejects calls without a token, with a bad token, or from STAFF', async () => {
    const body = { action: 'create', email: 'x@example.com', password: 'abcdefgh', displayName: 'X', role: 'STAFF' };
    expect((await handler(post('admin-users', body))).status).toBe(401);
    expect((await handler(post('admin-users', body, 'not-a-token'))).status).toBe(401);
    expect((await handler(post('admin-users', body, staffToken))).status).toBe(403);
    expect((await handler(new Request('http://localhost/x', { method: 'GET' }))).status).toBe(405);
  });

  it('lets an ADMIN create a STAFF user with the role claim and profile', async () => {
    const res = await handler(
      post('admin-users', { action: 'create', email: 'New@Example.com', password: 'newpass123', displayName: 'New Staff', role: 'STAFF' }, adminToken),
    );
    expect(res.status).toBe(200);
    const { uid } = (await res.json()) as { uid: string };
    const user = await adminAuth().getUser(uid);
    expect(user.email).toBe('new@example.com');
    expect(user.customClaims?.role).toBe('STAFF');
    const profile = await adminDb().doc(`users/${uid}`).get();
    expect(profile.data()?.role).toBe('STAFF');
    // The new user can sign in and gets the STAFF claim in their token.
    const token = await idTokenFor('new@example.com', 'newpass123');
    expect(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).role).toBe('STAFF');

    // Duplicate email -> 409
    const dup = await handler(
      post('admin-users', { action: 'create', email: 'new@example.com', password: 'newpass123', displayName: 'x', role: 'STAFF' }, adminToken),
    );
    expect(dup.status).toBe(409);

    // Disable -> the account is disabled and its old token no longer works.
    expect((await handler(post('admin-users', { action: 'disable', uid }, adminToken))).status).toBe(200);
    expect((await adminAuth().getUser(uid)).disabled).toBe(true);
    expect((await handler(post('admin-users', { action: 'create' }, token))).status).toBe(401);

    expect((await handler(post('admin-users', { action: 'enable', uid }, adminToken))).status).toBe(200);
    expect((await handler(post('admin-users', { action: 'setRole', uid, role: 'ADMIN' }, adminToken))).status).toBe(200);
    expect((await adminAuth().getUser(uid)).customClaims?.role).toBe('ADMIN');
  });

  it('validates input and prevents admins locking themselves out', async () => {
    const bad = await handler(post('admin-users', { action: 'create', email: 'nope', password: 'x', role: 'STAFF' }, adminToken));
    expect(bad.status).toBe(400);
    const badRole = await handler(post('admin-users', { action: 'create', email: 'r@example.com', password: 'abcdefgh1', role: 'ROOT' }, adminToken));
    expect(badRole.status).toBe(400);
    const self = await handler(post('admin-users', { action: 'disable', uid: adminUid }, adminToken));
    expect(self.status).toBe(400);
  });
});
