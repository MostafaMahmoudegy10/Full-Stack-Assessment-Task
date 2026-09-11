/**
 * Cross-platform helper that loads the monorepo root .env and launches
 * a Next.js command with the WEB_PORT value from the environment.
 *
 * Usage (from package.json):
 *   "dev":   "node scripts/with-env.js dev"
 *   "start": "node scripts/with-env.js start"
 */
const { resolve } = require('node:path');
const { spawn } = require('node:child_process');

require('dotenv').config({ path: resolve(__dirname, '../../../.env') });

const [, , ...args] = process.argv;
const port = process.env.WEB_PORT || '3742';

const child = spawn('npx', ['next', ...args, '--port', port], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));

