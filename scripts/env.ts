// Load ./.env (if present) for local scripts. Never committed.
import { existsSync, readFileSync } from 'node:fs';

export function loadDotEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * --key path/to/service-account.json: take FIREBASE_PROJECT_ID / CLIENT_EMAIL /
 * PRIVATE_KEY from a downloaded key file (Cloud Shell use), instead of exports.
 * Returns true when a key file was given. Delete the file after use.
 */
export function loadKeyFile(): boolean {
  const path = arg('key');
  if (!path) return false;
  if (!existsSync(path)) throw new Error(`Key file not found: ${path}`);
  const key = JSON.parse(readFileSync(path, 'utf8')) as { project_id?: string; client_email?: string; private_key?: string };
  if (!key.project_id || !key.client_email || !key.private_key) throw new Error(`${path} is not a Firebase service-account key file`);
  process.env.FIREBASE_PROJECT_ID = key.project_id;
  process.env.FIREBASE_CLIENT_EMAIL = key.client_email;
  process.env.FIREBASE_PRIVATE_KEY = key.private_key;
  return true;
}
