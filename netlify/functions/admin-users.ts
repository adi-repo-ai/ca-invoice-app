// ADMIN-only user management: create staff users, change roles, disable /
// enable accounts and set a new password. Every call verifies the caller's
// Firebase ID token and ADMIN claim before doing anything.
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './_shared/admin';
import { HttpError, postHandler, readJson, requireRole, type Role } from './_shared/http';

type Body =
  | { action: 'create'; email: string; password: string; displayName: string; role: Role }
  | { action: 'setRole'; uid: string; role: Role }
  | { action: 'disable'; uid: string }
  | { action: 'enable'; uid: string }
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
