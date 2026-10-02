import { beforeAll, describe, expect, it } from 'vitest';
import { clearAuth, idTokenFor, post } from './fn-helpers';
import { adminAuth, adminDb } from '../../netlify/functions/_shared/admin';
import handler from '../../netlify/functions/activate';

let invitedToken: string;
let strangerToken: string;
let unverifiedToken: string;
let invitedUid: string;

beforeAll(async () => {
  await clearAuth();
  const auth = adminAuth();
  invitedUid = (await auth.createUser({ email: 'Partner@Gmail.com', password: 'partner123', emailVerified: true })).uid;
  await auth.createUser({ email: 'stranger@gmail.com', password: 'stranger123', emailVerified: true });
  await auth.createUser({ email: 'unverified@gmail.com', password: 'unverified123', emailVerified: false });
  await adminDb().doc('invites/partner@gmail.com').set({ email: 'partner@gmail.com', role: 'ADMIN', invitedBy: 'admin-1' });
  invitedToken = await idTokenFor('partner@gmail.com', 'partner123');
  strangerToken = await idTokenFor('stranger@gmail.com', 'stranger123');
  unverifiedToken = await idTokenFor('unverified@gmail.com', 'unverified123');
});

describe('activate function (Google sign-in allow-list)', () => {
  it('refuses people who were not invited or are unverified', async () => {
    expect((await handler(post('activate', {}))).status).toBe(401);
    expect((await handler(post('activate', {}, strangerToken))).status).toBe(403);
    expect((await handler(post('activate', {}, unverifiedToken))).status).toBe(403);
  });

  it('gives an invited email its role exactly once', async () => {
    const res = await handler(post('activate', {}, invitedToken));
    expect(res.status).toBe(200);
    expect((await adminAuth().getUser(invitedUid)).customClaims).toEqual({ role: 'ADMIN', fin: false, pay: false });
    expect((await adminDb().doc(`users/${invitedUid}`).get()).data()?.role).toBe('ADMIN');
    expect((await adminDb().doc('invites/partner@gmail.com').get()).exists).toBe(false);
  });
});
