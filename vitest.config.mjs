import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

// @next/env skips .env.local under NODE_ENV=test, so read it with Vite's loader.
// A real environment variable wins, which lets each agent pick its own database.
const env = loadEnv('test', root, '');
const testUrl = env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.local or the environment.');
}
// The suite truncates every table, so never let it near a real database.
const databaseName = new URL(testUrl).pathname.slice(1);
if (!/test/i.test(databaseName)) {
  throw new Error(`Refusing to run tests against "${databaseName}": the name must contain "test".`);
}

const testEnv = {
  DATABASE_URL: testUrl,
  TEST_DATABASE_URL: testUrl,
  APP_URL: env.APP_URL || 'http://localhost:3000',
  APP_TIMEZONE: env.APP_TIMEZONE || 'Asia/Kolkata',
};
// globalSetup runs in this process, test files in workers: both need the values.
Object.assign(process.env, testEnv);

export default defineConfig({
  // The app keeps JSX in .js files, so page and form tests need it transformed.
  oxc: { lang: 'jsx', include: /\.js$/, exclude: /node_modules/, jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: /^@backend\//, replacement: `${path.join(root, 'backend/src').replaceAll('\\', '/')}/` },
      { find: /^@\//, replacement: `${path.join(root, 'frontend/src').replaceAll('\\', '/')}/` },
    ],
  },
  test: {
    environment: 'node',
    include: ['backend/tests/**/*.test.js', 'frontend/tests/**/*.test.js'],
    env: testEnv,
    globalSetup: ['backend/tests/helpers/global-setup.mjs'],
    setupFiles: ['backend/tests/helpers/setup.js'],
    // Test files share one database, so they must not run at the same time.
    fileParallelism: false,
    // bcrypt at cost 12 is deliberately slow.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
