// One-time script: create (or promote) the first ADMIN user.
//
//   Emulator:  npm run create-admin -- --email you@firm.in --password '...' --name 'Your Name'
//   Live:      npm run create-admin -- --email ... --password ... --name ... --live
//   Key file:  npm run create-admin -- --key ~/key.json --email ... --password ... --name ...
//
// Uses FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY from
// the environment or ./.env. Against a live project it refuses to run unless
// --live is passed AND no emulator variables are set, so it can't hit the
// wrong place by accident.
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb, usingEmulators } from '../netlify/functions/_shared/admin';
import { arg, flag, loadDotEnv, loadKeyFile } from './env';

async function main() {
  loadDotEnv();
  const live = loadKeyFile() || flag('live');
  if (live) {
    // Explicitly targeting the real project: ignore emulator settings.
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.error('Live mode needs FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.');
      process.exit(1);
    }
  }

  const email = arg('email')?.trim().toLowerCase();
  const password = arg('password');
  const name = arg('name') ?? '';
  if (!email || !password || password.length < 8) {
    console.error('Usage: npm run create-admin -- --email EMAIL --password PASSWORD(min 8) --name NAME [--live]');
    process.exit(1);
  }
  if (!live && !usingEmulators()) {
    console.error('No emulator configured. Set FIREBASE_AUTH_EMULATOR_HOST/FIRESTORE_EMULATOR_HOST, or pass --live to target the real project.');
    process.exit(1);
  }
  console.log(`Target: ${live ? 'LIVE project' : 'EMULATOR'} "${process.env.FIREBASE_PROJECT_ID}"`);

  const auth = adminAuth();
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    console.log(`User exists (${uid}); promoting to ADMIN.`);
  } catch {
    const u = await auth.createUser({ email, password, displayName: name });
    uid = u.uid;
    console.log(`Created user ${uid}.`);
  }
  await auth.setCustomUserClaims(uid, { role: 'ADMIN', fin: true, pay: true });
  await adminDb().doc(`users/${uid}`).set(
    {
      email,
      displayName: name,
      role: 'ADMIN',
      fin: true,
      pay: true,
      disabled: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'create-admin-script',
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'create-admin-script',
    },
    { merge: true },
  );
  console.log(`✔ ${email} is now an ADMIN. Sign in at /login.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
