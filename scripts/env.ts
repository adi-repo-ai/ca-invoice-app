// Load ./.env (if present) for local scripts. Never committed.
import { existsSync } from 'node:fs';

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
