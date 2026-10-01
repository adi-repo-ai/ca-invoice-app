import { defineConfig } from 'vitest/config';

// Tests that need the Firebase Auth + Firestore emulators.
// Run via `npm run test:emulator` (wraps them in `firebase emulators:exec`).
export default defineConfig({
  test: {
    include: ['tests/emulator/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
