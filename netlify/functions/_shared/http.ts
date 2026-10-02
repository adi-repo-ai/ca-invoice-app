// Request helpers shared by all functions: JSON responses, error mapping and
// Firebase ID-token verification with role checks.
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from './admin';

export type Role = 'ADMIN' | 'STAFF';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Verify the caller's Firebase ID token (including revocation / disabled status). */
export async function requireSignedIn(req: Request): Promise<DecodedIdToken> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'Missing Authorization bearer token');
  try {
    return await adminAuth().verifyIdToken(m[1], true);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    if (code === 'auth/user-disabled') throw new HttpError(401, 'This account has been disabled');
    if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error'].includes(code)) {
      throw new HttpError(401, 'Your sign-in has expired. Please sign out and sign in again.');
    }
    // Anything else is almost always server configuration (FIREBASE_* env vars).
    console.error('ID token verification failed', code, (e as Error).message);
    throw new HttpError(
      500,
      `Server could not verify your sign-in (${code || (e as Error).message}). Check the FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY variables in Netlify.`,
    );
  }
}

/**
 * Verify the caller's Firebase ID token and require one of the given roles from the `role` custom claim.
 */
export async function requireRole(req: Request, roles: Role[]): Promise<DecodedIdToken> {
  const token = await requireSignedIn(req);
  if (!roles.includes(token.role as Role)) {
    throw new HttpError(403, 'You do not have permission for this action');
  }
  return token;
}

export async function readJson<T>(req: Request, maxBytes: number): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new HttpError(413, 'Request body too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request body too large');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
}

/** Wrap a POST-only handler with uniform error handling. */
export function postHandler(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
    try {
      return json(200, await fn(req));
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message });
      console.error(e);
      return json(500, { error: 'Internal error' });
    }
  };
}

/**
 * Per-person permissions carried in the token next to `role`:
 *   fin: can see revenue totals, reports, CSV export and backup
 *   pay: can record payments, send receipts and client statements
 * Accounts made before these flags existed keep what they had: ADMINs see
 * revenue, everyone may record payments.
 */
export function perms(claims: Record<string, unknown>): { fin: boolean; pay: boolean } {
  const role = claims.role;
  if (role !== 'ADMIN' && role !== 'STAFF') return { fin: false, pay: false };
  return {
    fin: typeof claims.fin === 'boolean' ? claims.fin : role === 'ADMIN',
    pay: typeof claims.pay === 'boolean' ? claims.pay : true,
  };
}

/** An owner is an ADMIN who can also see revenue (e.g. the firm's proprietor). */
export function isOwner(claims: Record<string, unknown> | undefined): boolean {
  return Boolean(claims && claims.role === 'ADMIN' && perms(claims).fin);
}

/** Starting permissions for a newly added person (an owner can change them later). */
export function defaultPerms(role: Role): { fin: boolean; pay: boolean } {
  return { fin: false, pay: role === 'STAFF' };
}
