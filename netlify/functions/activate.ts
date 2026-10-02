// Google sign-in access check. When someone signs in (e.g. with Google) and
// has no role yet, the app calls this. If an ADMIN has invited their email
// (Settings → Users), they get that role and access level; otherwise access
// is refused.
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './_shared/admin';
import { HttpError, postHandler, requireSignedIn, defaultPerms } from './_shared/http';

export default postHandler(async (req) => {
  const caller = await requireSignedIn(req);
  if (caller.role === 'ADMIN' || caller.role === 'STAFF') return { role: caller.role };
  const email = String(caller.email ?? '').toLowerCase();
  if (!email || caller.email_verified !== true) {
    throw new HttpError(403, 'Your email address is not verified. Sign in with Google to continue.');
  }
  const db = adminDb();
  const ref = db.doc(`invites/${email}`);
  const invite = await ref.get();
  if (!invite.exists) {
    throw new HttpError(403, `${email} has not been given access. Ask an administrator to add it in Settings → Users.`);
  }
  const data = invite.data()!;
  const role = data.role === 'ADMIN' ? 'ADMIN' : 'STAFF';
  // The invite may carry the access level chosen by an owner; otherwise defaults.
  const def = defaultPerms(role);
  const p = { fin: role === 'ADMIN' && data.fin === true, pay: typeof data.pay === 'boolean' ? data.pay : def.pay };
  await adminAuth().setCustomUserClaims(caller.uid, { role, ...p });
  await db.doc(`users/${caller.uid}`).set(
    {
      email,
      displayName: (caller.name as string | undefined) ?? '',
      role,
      ...p,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: data.invitedBy ?? 'invite',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
    },
    { merge: true },
  );
  await ref.delete(); // the invite has been used; the user now appears under Users
  return { role };
});
