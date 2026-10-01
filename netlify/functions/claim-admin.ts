// One-time bootstrap: lets the very first signed-in user become ADMIN by
// entering the SETUP_CODE configured in Netlify. It works only while
// SETUP_CODE is set AND no ADMIN exists AND it has never been used before
// (a lock document makes it single-use). Delete SETUP_CODE afterwards.
import { createHash, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './_shared/admin';
import { HttpError, postHandler, readJson, requireSignedIn } from './_shared/http';

const LOCK = 'system/bootstrap';

function sameSecret(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

async function anyAdminExists(): Promise<boolean> {
  const profiles = await adminDb().collection('users').where('role', '==', 'ADMIN').limit(1).get();
  if (!profiles.empty) return true;
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    if (page.users.some((u) => u.customClaims?.role === 'ADMIN')) return true;
    pageToken = page.pageToken;
  } while (pageToken);
  return false;
}

export default postHandler(async (req) => {
  const caller = await requireSignedIn(req);
  const configured = process.env.SETUP_CODE ?? '';
  if (configured.length < 12) throw new HttpError(403, 'First-time setup is not enabled');
  const { code } = await readJson<{ code?: string }>(req, 2_000);
  if (typeof code !== 'string' || !sameSecret(code.trim(), configured)) {
    throw new HttpError(403, 'Incorrect setup code');
  }
  if (await anyAdminExists()) throw new HttpError(409, 'An administrator already exists. Ask them to add you.');

  const db = adminDb();
  try {
    // create() fails if the lock exists, so only one caller can ever win.
    await db.doc(LOCK).create({ claimedBy: caller.uid, email: caller.email ?? '', at: FieldValue.serverTimestamp() });
  } catch {
    throw new HttpError(409, 'First-time setup has already been used');
  }
  try {
    await adminAuth().setCustomUserClaims(caller.uid, { role: 'ADMIN' });
    await db.doc(`users/${caller.uid}`).set(
      {
        email: caller.email ?? '',
        displayName: (caller.name as string | undefined) ?? '',
        role: 'ADMIN',
        disabled: false,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'setup-code',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
      },
      { merge: true },
    );
  } catch (e) {
    await db.doc(LOCK).delete(); // allow a retry if granting the role failed
    throw e;
  }
  return { ok: true };
});
