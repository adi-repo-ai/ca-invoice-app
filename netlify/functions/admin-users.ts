// ADMIN-only user management: create staff users, change roles, disable /
// enable / delete accounts and set a new password. Every call verifies the caller's
// Firebase ID token and ADMIN claim before doing anything.
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './_shared/admin';
import { HttpError, postHandler, readJson, requireRole, type Role } from './_shared/http';

type Body =
  | { action: 'create'; email: string; password: string; displayName: string; role: Role }
  | { action: 'setRole'; uid: string; role: Role }
  | { action: 'disable'; uid: string }
  | { action: 'enable'; uid: string }
  | { action: 'delete'; uid: string }
  | { action: 'setPassword'; uid: string; password: string };

const ROLES: Role[] = ['ADMIN', 'STAFF'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkPassword(p: unknown): string {
  if (typeof p !== 'string' || p.length < 8 || p.length > 128) {
    throw new HttpError(400, 'Password must be 8–128 characters');
  }
  return p;
}
function checkRole(r: unknown): Role {
  if (!ROLES.includes(r as Role)) throw new HttpError(400, 'Role must be ADMIN or STAFF');
  return r as Role;
}
function checkUid(u: unknown, callerUid: string, what: string): string {
  if (typeof u !== 'string' || !u) throw new HttpError(400, 'uid is required');
  if (u === callerUid) throw new HttpError(400, `You cannot ${what} your own account`);
  return u;
}

export default postHandler(async (req) => {
  const caller = await requireRole(req, ['ADMIN']);
  const body = await readJson<Body>(req, 10_000);
  const auth = adminAuth();
  const db = adminDb();
  const stamp = { updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid };

  switch (body.action) {
    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
      const displayName = String(body.displayName ?? '').trim().slice(0, 100);
      const role = checkRole(body.role);
      const password = checkPassword(body.password);
      let user;
      try {
        user = await auth.createUser({ email, password, displayName, emailVerified: false });
      } catch (e) {
        if ((e as { code?: string }).code === 'auth/email-already-exists') {
          throw new HttpError(409, 'A user with this email already exists');
        }
        throw e;
      }
      await auth.setCustomUserClaims(user.uid, { role });
      await db.doc(`users/${user.uid}`).set({
        email,
        displayName,
        role,
        disabled: false,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: caller.uid,
        ...stamp,
      });
      return { uid: user.uid };
    }
    case 'setRole': {
      const uid = checkUid(body.uid, caller.uid, 'change the role of');
      const role = checkRole(body.role);
      await auth.setCustomUserClaims(uid, { role });
      // Force existing sessions to re-authenticate so the new role applies.
      await auth.revokeRefreshTokens(uid);
      await db.doc(`users/${uid}`).set({ role, ...stamp }, { merge: true });
      return { ok: true };
    }
    case 'disable': {
      const uid = checkUid(body.uid, caller.uid, 'disable');
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
      await db.doc(`users/${uid}`).set({ disabled: true, ...stamp }, { merge: true });
      return { ok: true };
    }
    case 'enable': {
      const uid = checkUid(body.uid, caller.uid, 'enable');
      await auth.updateUser(uid, { disabled: false });
      await db.doc(`users/${uid}`).set({ disabled: false, ...stamp }, { merge: true });
      return { ok: true };
    }
    case 'delete': {
      // Removes the sign-in account, the user record, any pending invite and
      // their private Home items. Invoices they created are kept.
      const uid = checkUid(body.uid, caller.uid, 'delete');
      const userDoc = await db.doc(`users/${uid}`).get();
      let email = String(userDoc.get('email') ?? '');
      try {
        email = (await auth.getUser(uid)).email ?? email;
        await auth.deleteUser(uid);
      } catch (e) {
        if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
      }
      const batch = db.batch();
      batch.delete(db.doc(`users/${uid}`));
      if (email) batch.delete(db.doc(`invites/${email.toLowerCase()}`));
      for (const coll of ['tasks', 'events', 'notes', 'links']) {
        const snap = await db.collection(coll).where('ownerUid', '==', uid).limit(400).get();
        snap.docs.forEach((d) => batch.delete(d.ref));
      }
      await batch.commit();
      return { ok: true };
    }
    case 'setPassword': {
      const uid = checkUid(body.uid, caller.uid, 'reset the password of');
      await auth.updateUser(uid, { password: checkPassword(body.password) });
      await auth.revokeRefreshTokens(uid);
      return { ok: true };
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
});
