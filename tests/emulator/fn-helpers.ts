// Helpers for exercising Netlify Function handlers against the emulators.
import { PROJECT_ID } from './helpers';

process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

/** Sign in through the Auth emulator REST API and return a real ID token. */
export async function idTokenFor(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const data = (await res.json()) as { idToken?: string; error?: { message: string } };
  if (!data.idToken) throw new Error(`sign-in failed: ${data.error?.message}`);
  return data.idToken;
}

export async function clearAuth(): Promise<void> {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
}

export function post(path: string, body: unknown, token?: string): Request {
  return new Request(`http://localhost/.netlify/functions/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
