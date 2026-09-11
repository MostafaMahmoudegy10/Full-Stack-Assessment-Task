# Deploy ProjectFlow as one Heroku app

One web dyno runs two Node processes: Next.js listens on Heroku's assigned `PORT`,
and NestJS listens only on `127.0.0.1:4732`. Next forwards `/api/*` to Nest without
the `/api` prefix. The browser uses relative `/api` URLs. Existing assignment and
activity behavior, schemas, and local development commands are unchanged.

## Config Vars

In Heroku **Settings → Reveal Config Vars**, configure:

| Key              | Value                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`       | `production`                                                                              |
| `MONGODB_URI`    | Complete provider-issued MongoDB connection URI for your database                         |
| `JWT_SECRET`     | A new random secret, generated locally                                                    |
| `JWT_EXPIRES_IN` | `7d`                                                                                      |
| `WEB_ORIGIN`     | Your exact public origin, e.g. `https://YOUR-APP.herokuapp.com`, without a trailing slash |

Generate a JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Store the result only in Config Vars. Never commit credentials or paste them into
PRs. Replace any database password exposed in screenshots before deployment.

For the supplied MongoDB service, select the database **`projectFlow`** (preserve
case) and its database user in the provider dashboard. Copy the provider's full
connection URI, replacing its username/password/database placeholders. Encode
reserved characters in username/password with `encodeURIComponent`; do not encode
the whole URI or include Markdown escape backslashes. Preserve provider-specified
TLS/authentication options. A URI template alone does not establish connectivity.

The database must support transactions (a replica set or sharded cluster), because
assignment and history writes already use MongoDB transactions. Confirm this with
the provider; do not remove transaction protection to accommodate a standalone database.

Do **not** set `PORT`, `API_PORT`, `API_HOST`, `WEB_PORT`, `HOSTNAME`, `SINGLE_APP`,
or `NEXT_DIST_DIR` in Heroku. The launcher/build hook controls these values. Heroku
assigns the public port. Port 4732 is reserved internally.

`NEXT_PUBLIC_API_URL` is unnecessary for this deployment: the build hook forces
the browser API base to `/api`, including when a local `.env` contains a localhost
URL. Standalone local development still uses the existing `.env.example` values.

## Build and deploy

1. Merge the deployment phase PRs in order into `main` before deploying that branch.
2. Connect this repository to the existing Heroku app, using the repository root.
   Use the official Node.js buildpack; it supports the pinned pnpm package manager.
3. Set Config Vars before deployment. Leave build dependencies available during
   the build; Next, Nest CLI, TypeScript, and Turbo are required then.
4. Deploy `main`. Heroku runs `pnpm heroku-postbuild`: this builds shared, API,
   and standalone web output and copies static/public assets into that output.
5. Run one `web` dyno. `Procfile` launches `node scripts/start-heroku.cjs`.
   No separate worker is required for the API.
6. Open `/health`; it returns 200 once both servers respond. `/api/auth/me`
   returns 401 without a token. Then verify login, assignment/unassignment, and
   activity through the public site.

The supervisor forwards termination and stops the other process if either server
exits unexpectedly, allowing Heroku to restart the whole app. Both processes
share the dyno's memory; check actual memory usage and logs on your chosen plan.
`/health` checks API responsiveness and initial startup, not continuous database
availability or transaction support. A successful assignment verifies the latter.

## Database setup

Demo seeding is available in production after deployment. It uses the existing
seed dataset and the app's `MONGODB_URI` Config Var, without needing build tools.
It deletes and recreates ProjectFlow collections, including activity history.
Use it only for your disposable assessment/demo database, with nobody editing data.

From your terminal, run once (replace `YOUR-APP` with the Heroku app name):

```bash
heroku run --app YOUR-APP --exit-code -- node scripts/seed-demo.cjs --reset-demo-data
```

Or, where Heroku's **More → Run console** is available, enter:

```bash
node scripts/seed-demo.cjs --reset-demo-data
```

The equivalent pnpm command is `pnpm seed:demo --reset-demo-data`. The explicit
flag acknowledges the database reset. No credentials belong in the command;
Heroku supplies `MONGODB_URI` from Config Vars. The script refuses to run without
that variable or the reset flag. For CLI details, see
[Heroku one-off dynos](https://devcenter.heroku.com/articles/working-with-one-off-dynos).

After success, sign in with `ammar@example.com` / `Password123!` (demo owner).
Other seeded users are `sarah@example.com`, `ahmed@example.com`, `magd@example.com`,
and `outside@example.com`, with the same demo password. The seed creates projects,
tasks, comments, and memberships; new assignment changes populate activity history.
These public test accounts are for demonstration data only.

Normal deploys and restarts do not rerun the seed, so testing changes survive a
redeploy. Running the command again resets them. The existing local `pnpm seed`
command is unchanged. For an existing non-demo database, follow the task-number
migration steps in [README.md](README.md) with writers stopped before accepting traffic.

## Local production verification

```bash
pnpm heroku-postbuild
pnpm test:deployment
```

The deployment smoke test creates and seeds its own disposable MongoDB replica
set, then uses the real combined launcher. It never uses `MONGODB_URI` from your
shell or local `.env`. Like API tests, it supports `MONGOMS_SYSTEM_BINARY` and
`MONGOMS_SYSTEM_BINARY_VERSION_CHECK` for an installed test MongoDB executable.
Install Playwright Chromium as described in the README, or set
`PLAYWRIGHT_CHANNEL=chrome` to use an installed Chrome browser.

To start manually, export the Config Vars above plus a local `PORT` (e.g. 3742),
then run `pnpm start`. This production launcher requires environment variables;
it does not load a root `.env` on your behalf. `pnpm dev` remains unchanged.

## Deployment status

The repository includes deployment preparation. Public Heroku startup, provider
database connectivity/transactions, memory use, and public URL checks must still
be verified on the actual app. No database credentials are included here.

Local verification on 12 September 2026 passed the production build, TypeScript,
ESLint, and deployment smoke test using Chrome and a disposable MongoDB replica
set. The smoke test covers demo-seed guards and successful seeding, browser login,
static assets, same-origin assignment/unassignment and persisted history, and
cleanup after either server exits. POSIX signal forwarding is skipped on Windows
and still requires Linux/Heroku verification.

References: [Heroku Node support](https://devcenter.heroku.com/articles/nodejs-support),
[Heroku Node deployment](https://devcenter.heroku.com/articles/deploying-nodejs),
[Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).
