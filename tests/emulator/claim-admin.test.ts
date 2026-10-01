import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearAuth, idTokenFor, post } from './fn-helpers';
import { adminAuth, adminDb } from '../../netlify/functions/_shared/admin';
import handler from '../../netlify/functions/claim-admin';

const CODE = 'correct-horse-battery-staple';
let firstToken: string;
let secondToken: string;
let firstUid: string;

beforeAll(async () => {
  await clearAuth();
  const db = adminDb();
  for (const d of (await db.collection('users').get()).docs) await d.ref.delete();
  await db.doc('system/bootstrap').delete();
  const auth = adminAuth();
  firstUid = (await auth.createUser({ email: 'owner@example.com', password: 'owner12345' })).uid;
  await auth.createUser({ email: 'second@example.com', password: 'second12345' });
  firstToken = await idTokenFor('owner@example.com', 'owner12345');
  secondToken = await idTokenFor('second@example.com', 'second12345');
});
afterAll(() => {
  delete process.env.SETUP_CODE;
});

const call = (code: string, token?: string) => handler(post('claim-admin', { code }, token));

describe('claim-admin function', () => {
  it('is disabled unless SETUP_CODE is configured', async () => {
    delete process.env.SETUP_CODE;
    expect((await call(CODE, firstToken)).status).toBe(403);
    process.env.SETUP_CODE = 'short';
    expect((await call('short', firstToken)).status).toBe(403);
    process.env.SETUP_CODE = CODE;
  });

  it('requires a signed-in user and the right code', async () => {
    expect((await call(CODE)).status).toBe(401);
    expect((await call('wrong-code-here', firstToken)).status).toBe(403);
  });

  it('makes the first user ADMIN exactly once', async () => {
    expect((await call(CODE, firstToken)).status).toBe(200);
    expect((await adminAuth().getUser(firstUid)).customClaims?.role).toBe('ADMIN');
    expect((await adminDb().doc(`users/${firstUid}`).get()).data()?.role).toBe('ADMIN');
    // Nobody else can use it afterwards, even with the right code.
    expect((await call(CODE, secondToken)).status).toBe(409);
  });
});
