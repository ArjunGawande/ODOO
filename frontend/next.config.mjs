import path from 'node:path';
import { fileURLToPath } from 'node:url';

import nextEnv from '@next/env';

const here = path.dirname(fileURLToPath(import.meta.url));
// The repo root holds package.json, node_modules, .env.local and the backend code.
const repoRoot = path.join(here, '..');

// Next only reads env files from this app's folder, so load the shared root ones too.
nextEnv.loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production', { info() {}, error: console.error }, true);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app imports backend/src, which sits outside this folder.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // knex requires every dialect driver dynamically, so it must never be bundled.
  serverExternalPackages: ['knex', 'pg', 'bcryptjs', 'nodemailer'],
  async headers() {
    return [
      {
        // The reset link carries a live token in its query string.
        source: '/reset-password',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
