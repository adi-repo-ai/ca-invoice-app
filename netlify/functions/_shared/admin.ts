// Firebase Admin SDK bootstrap for Netlify Functions and local scripts.
// Configured ONLY from three env vars (never a JSON key file):
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// When FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST are set (local
// development only) the SDK talks to the emulators and needs no credentials.
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function usingEmulators(): boolean {
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST);
}

export function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set');
  if (usingEmulators()) return initializeApp({ projectId });

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim().replace(/^"(.*)"$/, '$1');
  // Netlify stores the key on one line with literal "\n" sequences.
  // Tolerate a value pasted with surrounding quotes or a trailing comma
  // (copied straight from the JSON file).
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim()
    .replace(/,$/, '')
    .replace(/^"(.*)"$/s, '$1')
    .replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY are not set');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
