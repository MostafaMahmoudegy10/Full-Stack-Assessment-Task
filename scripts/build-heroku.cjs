const { spawnSync } = require('node:child_process');
const { cpSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const result = spawnSync('pnpm', ['build'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NODE_ENV: 'production', SINGLE_APP: 'true', NEXT_DIST_DIR: '.next' },
});
if (result.error || result.status !== 0) {
  console.error('Heroku build failed.');
  process.exit(result.status || 1);
}

// Next standalone output deliberately omits these assets; ship them alongside server.js.
const web = resolve(root, 'apps/web');
const standaloneWeb = resolve(web, '.next/standalone/apps/web');
if (!existsSync(resolve(standaloneWeb, 'server.js'))) {
  throw new Error('Missing standalone web server; check the single-app build configuration.');
}
cpSync(resolve(web, '.next/static'), resolve(standaloneWeb, '.next/static'), { recursive: true });
if (existsSync(resolve(web, 'public'))) {
  cpSync(resolve(web, 'public'), resolve(standaloneWeb, 'public'), { recursive: true });
}
