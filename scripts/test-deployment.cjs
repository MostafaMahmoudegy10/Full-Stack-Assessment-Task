const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { createServer } = require('node:net');
const { resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const root = resolve(__dirname, '..');
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'));
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const { MongoMemoryReplSet } = apiRequire('mongodb-memory-server');
const { chromium } = webRequire('@playwright/test');

async function freePort(port = 0) {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', ok);
  });
  const assigned = server.address().port;
  await new Promise((ok) => server.close(ok));
  return assigned;
}

function run(entry, env, args = []) {
  const child = spawn(process.execPath, [resolve(root, entry), ...args], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const done = new Promise((ok, fail) => {
    child.once('error', fail);
    child.once('close', (code) => ok(code));
  });
  return { child, done, output: () => output };
}

async function until(check, description, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(200);
  }
  throw new Error(`Timed out: ${description}`);
}

async function main() {
  const noFlag = run('scripts/seed-demo.cjs', { ...process.env, MONGODB_URI: '' });
  assert.equal(await noFlag.done, 1);
  assert.match(noFlag.output(), /--reset-demo-data/);
  const noUri = run('scripts/seed-demo.cjs', { ...process.env, MONGODB_URI: '' }, [
    '--reset-demo-data',
  ]);
  assert.equal(await noUri.done, 1);
  assert.match(noUri.output(), /MONGODB_URI must be set explicitly/);
  console.log('PASS: demo seed refuses missing reset flag or explicit database URI.');
  await freePort(4732); // Refuse to interfere with an existing local API.
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let database;
  let app;
  let browser;
  const apiPid = () => Number(app?.output().match(/API process started \(pid (\d+)\)/)?.[1]);
  const webPid = () => Number(app?.output().match(/Web process started \(pid (\d+)\)/)?.[1]);
  const kill = (pid) => {
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  };
  try {
    database = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const env = {
      ...process.env,
      MONGODB_URI: database.getUri('deployment_smoke'),
      JWT_SECRET: randomBytes(48).toString('hex'),
      JWT_EXPIRES_IN: '7d',
      WEB_ORIGIN: origin,
      PORT: String(port),
      NODE_ENV: 'production',
    };
    // Always overwrite inherited credentials BEFORE invoking the destructive demo seed.
    const seed = run('scripts/seed-demo.cjs', env, ['--reset-demo-data']);
    assert.equal(await seed.done, 0, 'Disposable database seed failed');
    console.log('PASS: production demo-seed command populates an isolated database.');
    const start = async () => {
      app = run('scripts/start-heroku.cjs', env);
      await until(async () => {
        if (app.child.exitCode !== null) throw new Error(app.output());
        try {
          return (await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) })).ok;
        } catch {
          return false;
        }
      }, 'combined server readiness');
    };
    await start();
    assert.equal((await fetch(`${origin}/api/auth/me`)).status, 401);
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    const page = await browser.newPage();
    const failedAssets = [];
    const apiOrigins = new Set();
    page.on('response', (response) => {
      if (response.url().includes('/_next/static/') && !response.ok()) {
        failedAssets.push(response.url());
      }
    });
    page.on('request', (request) => {
      if (['fetch', 'xhr'].includes(request.resourceType())) {
        apiOrigins.add(new URL(request.url()).origin);
      }
    });
    await page.goto(`${origin}/login`);
    await page.getByLabel('Email', { exact: true }).fill('ammar@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Password123!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/projects');
    const token = await page.evaluate(() => localStorage.getItem('projectflow.accessToken'));
    assert.ok(token, 'Browser login must persist its access token');
    const request = async (path) => {
      const response = await fetch(`${origin}/api${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 200, path);
      return response.json();
    };
    const projects = await request('/projects');
    const project = projects.find((item) => item.key === 'PLAT') || projects[0];
    const tasks = await request(`/projects/${project.id}/tasks?pageSize=100`);
    const task = tasks.items[0];
    const members = await request(`/projects/${project.id}/members`);
    const target = members.find((entry) => entry.user.id !== task.assignedTo).user;
    const before = await request(`/tasks/${task.id}/activity?pageSize=100`);
    await page.goto(`${origin}/projects/${project.id}/tasks/${task.id}`);
    const select = page.getByLabel('Assignee', { exact: true });
    await select.waitFor();
    await until(() => select.isEnabled(), 'assignee options');
    const assignResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tasks/${task.id}/assignee`) &&
        response.request().method() === 'PATCH',
    );
    await select.selectOption(target.id);
    assert.equal((await assignResponse).status(), 200);
    await until(() => select.isEnabled(), 'assignment save');
    const unassignResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tasks/${task.id}/assignee`) &&
        response.request().method() === 'PATCH',
    );
    await select.selectOption('');
    assert.equal((await unassignResponse).status(), 200);
    const history = await request(`/tasks/${task.id}/activity?page=1&pageSize=100`);
    assert.equal(history.total, before.total + 2);
    assert.equal(history.items[0].metadata.to, null);
    assert.equal(history.items[1].metadata.to, target.id);
    assert.equal((await request(`/tasks/${task.id}`)).assignedTo, null);
    assert.deepEqual(failedAssets, [], 'Standalone CSS/JS must be served');
    assert.deepEqual([...apiOrigins], [origin], 'Browser must use only the public origin');
    await browser.close();
    browser = null;
    console.log(
      'PASS: browser login, static assets, assignment/unassignment, and persisted history through one origin.',
    );

    for (const name of ['API', 'Web']) {
      kill(name === 'API' ? apiPid() : webPid());
      await until(() => app.child.exitCode !== null, `${name} failure stops supervisor`, 15000);
      assert.equal(await app.done, 1);
      await freePort(4732);
      await freePort(port);
      console.log(`PASS: ${name} failure stops both servers and releases ports.`);
      if (name === 'API') await start();
    }
    if (process.platform !== 'win32') {
      await start();
      app.child.kill('SIGTERM');
      await until(() => app.child.exitCode !== null, 'graceful shutdown', 15000);
      assert.equal(await app.done, 0);
      await freePort(4732);
      await freePort(port);
      console.log('PASS: SIGTERM cleanly stops both servers.');
    } else {
      console.log(
        'SKIP: POSIX SIGTERM forwarding requires Linux; Windows child-failure cleanup verified.',
      );
    }
  } catch (error) {
    if (app) console.error(app.output()); // Only isolated test environment is used above.
    throw error;
  } finally {
    await browser?.close();
    kill(apiPid());
    kill(webPid());
    if (app && app.child.exitCode === null) {
      await Promise.race([app.done, delay(10000)]);
      if (app.child.exitCode === null) app.child.kill();
    }
    await database?.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
