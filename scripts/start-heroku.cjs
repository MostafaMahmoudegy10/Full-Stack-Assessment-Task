const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 4732) {
  console.error('PORT must be a valid public port different from internal API port 4732.');
  process.exit(1);
}
for (const name of ['MONGODB_URI', 'JWT_SECRET', 'WEB_ORIGIN']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}
const entries = [
  ['API', resolve(root, 'apps/api/dist/main.js'), resolve(root, 'apps/api')],
  ['Web', resolve(root, 'apps/web/.next/standalone/apps/web/server.js'), root],
];
for (const [name, entry] of entries) {
  if (!existsSync(entry)) {
    console.error(`${name} build missing. Run pnpm heroku-postbuild first.`);
    process.exit(1);
  }
}

const children = new Set();
let stopping = false;
let exitCode = 0;
let forceStop;

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  // Leave enough time for Heroku's own shutdown deadline.
  forceStop = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 8000);
  forceStop.unref();
  if (children.size === 0) process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

for (const [name, entry, cwd] of entries) {
  if (stopping) break;
  const child = spawn(process.execPath, [entry], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SINGLE_APP: 'true',
      API_HOST: '127.0.0.1',
      API_PORT: '4732',
      HOSTNAME: '0.0.0.0',
      PORT: String(port),
    },
  });
  children.add(child);
  child.on('error', () => {
    console.error(`${name} failed to start.`);
    shutdown(1);
  });
  child.on('close', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${name} exited unexpectedly (${signal || code}); stopping the application.`);
      shutdown(1);
    }
    if (children.size === 0) {
      clearTimeout(forceStop);
      process.exit(exitCode);
    }
  });
}
