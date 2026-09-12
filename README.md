# ProjectFlow

ProjectFlow is a project and task tracker built with **Next.js, NestJS, and MongoDB** in a TypeScript monorepo. Organizations contain projects, projects contain tasks, and tasks have a creator, an optional assignee, comments, and assignment history.

**[Open the live demo](https://project-flow-d3b5cd641367.herokuapp.com/)** · [Deployment and demo login](#deployment-live-on-one-heroku-app)

## Current implementation

All five implementation phases have been merged into `main`. The required feature and production fixes are implemented. The app is deployed on Heroku; hosted demo seeding, public login, and authenticated project/task reads have been verified.

| Area                         | Implemented behavior                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Task assignment              | Project-member eligibility, elevated-role assignment, member self-assignment and self-unassignment, nullable assignee                       |
| Assignment history           | Atomic task/history writes, all three transitions, no-op suppression, actor and assignee names                                              |
| Activity API                 | Authorized access, newest-first pagination, deterministic timestamp/ID ordering, batched user lookup, compound index                        |
| Frontend                     | Assignee selector, search for larger member lists, permission/pending/error states, paginated readable history, keyboard and mobile support |
| Production authorization fix | Status mutations now check project access; outsider and cross-organization regression coverage                                              |
| Concurrent numbering         | Atomic project counters, unique project/number index, safe migration for existing data                                                      |
| Verification                 | 42 API tests, 5 browser tests, type checking, lint, production build, and a real API/database smoke check passed                            |
| Assessment documents         | Architecture/risks, bug investigation, code review, scaling discussion, AI log, and prioritized reflection                                  |

### Authorship and review history

The candidate authored the assignment/activity foundation in `aa5e8d1`, extending [the upstream starter](https://github.com/engtechno/Full-Stack-Assessment-Task) at `27c84d8`. The candidate's `9432dd2` also added the activity ID tie-breaker index and removed debug logging. These features were candidate additions, not starter functionality. Subsequent assisted work completed permissions, transactions, UI, tests, and documentation.

| Phase                                              | Pull request                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1. Task mutation authorization                     | [#2](https://github.com/MostafaMahmoudegy10/Full-Stack-Assessment-Task/pull/2) |
| 2. Assignment and activity consistency             | [#3](https://github.com/MostafaMahmoudegy10/Full-Stack-Assessment-Task/pull/3) |
| 3. Concurrent numbering and migration              | [#4](https://github.com/MostafaMahmoudegy10/Full-Stack-Assessment-Task/pull/4) |
| 4. Assignee selector and activity timeline         | [#5](https://github.com/MostafaMahmoudegy10/Full-Stack-Assessment-Task/pull/5) |
| 5. Validation, documentation, and main integration | [#6](https://github.com/MostafaMahmoudegy10/Full-Stack-Assessment-Task/pull/6) |

## Technology and architecture

| Area           | Technology                                         |
| -------------- | -------------------------------------------------- |
| Workspace      | pnpm 10.33.0, Turborepo, TypeScript 5.9            |
| API            | NestJS 11, Mongoose 8, MongoDB replica set         |
| Authentication | JWT bearer tokens and bcrypt password hashing      |
| Web            | Next.js 16 App Router, React 19                    |
| UI and forms   | Tailwind CSS 4, Radix, React Hook Form, Zod        |
| Server state   | TanStack Query 5                                   |
| Tests          | Jest, Supertest, mongodb-memory-server, Playwright |

```text
apps/api/src/       Controllers, DTOs, domain services, Mongoose schemas, database utilities
apps/api/test/      API integration tests and isolated database fixtures
apps/web/src/      App Router pages, reusable UI, feature components and query hooks
apps/web/test/     Playwright browser tests
packages/shared/  Shared domain enums and API response types
packages/         Shared TypeScript and ESLint configuration
```

API modules follow controller -> service -> Mongoose model. Business rules live in services. `ProjectAccessService` centralizes project authorization; the JWT guard runs globally except on public routes. Memberships are separate collections with unique compound indexes. Tasks reference their project, creator, and optional assignee; activity records reference their task and actor.

The web API client supplies bearer tokens and normalizes errors. Feature hooks own queries and mutations; shared query keys control cache updates. See [ASSESSMENT_NOTES.md](ASSESSMENT_NOTES.md) for the architecture explanation and decisions.

## Local setup

### 1. Prerequisites and installation

Install Node.js 20.19+ (22 or 24 recommended), pnpm 10.33.0, and either local MongoDB 7+ with `mongosh` or an accessible MongoDB Atlas cluster. Transactions require a replica set; a standalone MongoDB server is insufficient.

From the repository root:

```bash
pnpm install --frozen-lockfile
```

Copy the environment template:

```bash
# macOS/Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Replace the development `JWT_SECRET` with your own value. Both apps read root `.env`; hosted environments should supply variables through their provider's environment settings.

| Variable              | Meaning                                              | Local template/default                                                 |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `MONGODB_URI`         | Replica-set database connection; required            | `mongodb://localhost:27018/projectflow?replicaSet=rs0` in the template |
| `JWT_SECRET`          | Token-signing secret; required                       | Replace the development placeholder                                    |
| `JWT_EXPIRES_IN`      | Access-token lifetime                                | `7d`                                                                   |
| `API_PORT`            | Local API listening port                             | `4732`                                                                 |
| `WEB_ORIGIN`          | Frontend origin allowed by API CORS                  | `http://localhost:3742`                                                |
| `NEXT_PUBLIC_API_URL` | API URL used by the browser, including at build time | `http://localhost:4732`                                                |
| `WEB_PORT`            | Optional port used by the web dev/start helper       | `3742`                                                                 |

Keep URLs as plain values. Use `#` for dotenv comments; `//` after a URL becomes part of the value. Do not commit private environment files or use the development secret in a public deployment.

### 2. Initialize MongoDB

For Atlas, configure database access/network access and set `MONGODB_URI` to that cluster's connection string, including a database name. Skip the local commands below.

For local MongoDB, create a dedicated data directory:

```bash
# macOS/Linux
mkdir -p .local/mongo
```

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force .local/mongo
```

Start MongoDB in one terminal and leave it running:

```bash
mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27018 --dbpath .local/mongo
```

In a second terminal, open the MongoDB shell:

```bash
mongosh --host localhost --port 27018
```

Run this JavaScript **inside mongosh**, once for this data directory:

```javascript
rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27018' }] });
```

Wait for the node to become PRIMARY; `rs.status().myState` should return `1`. The `.env.example` URI matches this configuration. Keep the local instance bound to localhost.

### 3. Seed and start

```bash
pnpm seed
pnpm dev
```

`pnpm seed` builds the API and its dependencies, then **clears users, organizations, memberships, projects, tasks, comments, and activities in the configured database** and inserts development data. It also initializes task counters. Use it only with a disposable development/demo database, never as a production migration.

- Web: <http://localhost:3742>
- API: <http://localhost:4732>

To run apps separately:

```bash
pnpm --filter @projectflow/api dev
pnpm --filter @projectflow/web dev
```

If changing ports, update `API_PORT`, `WEB_PORT`, `WEB_ORIGIN`, and `NEXT_PUBLIC_API_URL` consistently. Restart/rebuild the frontend when changing its API URL.

### Development accounts

The seed creates these local-only accounts with password `Password123!`:

| Name         | Email                 | Access                 |
| ------------ | --------------------- | ---------------------- |
| Ammar Yaser  | `ammar@example.com`   | Organization owner     |
| Sarah Ahmed  | `sarah@example.com`   | Organization admin     |
| Ahmed Hassan | `ahmed@example.com`   | Project manager on ENG |
| Magd Ali     | `magd@example.com`    | Member of ENG and WEB  |
| Outside User | `outside@example.com` | No organization        |

Organization owners/admins can manage assignments without explicit project membership, but they are eligible assignees only when they are project members themselves.

## Assignment and activity behavior

- Owners, admins, and project managers can assign project members and remove any assignee.
- Regular project members can assign themselves, including replacing another assignee, and remove their own assignment. They cannot assign another person or remove someone else's assignment.
- Assignment is available in every task status, including DONE. Creator and assignee remain separate concepts.
- Assignment changes and their activity records commit in one MongoDB transaction. Retries reread the previous assignee; assigning the same user again creates no duplicate event.
- Task deletion removes comments and history transactionally. Missing referenced users retain their IDs and display as Unknown user.
- Activity is newest-first, paginated, authorized, and resolved using batched user queries with a `(task, createdAt desc, _id desc)` index.
- Task responses preserve `assignedTo` and add an assignee summary. Activity preserves `metadata.from/to` IDs and includes previous/new assignee summaries.

The frontend uses server-confirmed saves: controls are disabled while pending, failed requests retain the displayed value, and successful requests update task data and invalidate task-list/history queries. Managers can search name/email when a project has more than eight members. Assignment controls appear above long content on mobile.

## Concurrent numbering and migration

Task numbers are reserved with atomic `$inc` on a project counter. A unique `(projectId, number)` index enforces uniqueness. Deletion does not reuse numbers; failed inserts can leave gaps. Keys such as ENG-1 are project-specific rather than globally unique across organizations.

For an existing database, stop API writers and take a backup before applying the migration:

```bash
# Build the API together with its shared dependency.
pnpm exec turbo run build --filter=@projectflow/api

# Inspection only: does not modify data.
pnpm --filter @projectflow/api migrate:task-numbering

# Apply only while task writers are stopped.
pnpm --filter @projectflow/api migrate:task-numbering --apply
```

The migration detects duplicate legacy numbers and stops before modifying data if any exist. Resolve duplicates deliberately; it never silently renumbers tasks. It initializes counters from the maximum existing number, preserves larger counters, and replaces only the old nonunique project/number index. Reruns are safe with writers stopped. A fresh seed initializes counters automatically.

## API routes

All routes require a bearer token except register/login.

```text
POST   /auth/register
POST   /auth/login
GET    /auth/me
GET    /organizations
GET    /projects
POST   /projects
GET    /projects/:projectId
GET    /projects/:projectId/members
POST   /projects/:projectId/members
GET    /projects/:projectId/tasks
POST   /projects/:projectId/tasks
GET    /tasks/:taskId
PATCH  /tasks/:taskId
PATCH  /tasks/:taskId/status
PATCH  /tasks/:taskId/assignee
GET    /tasks/:taskId/activity
DELETE /tasks/:taskId
GET    /tasks/:taskId/comments
POST   /tasks/:taskId/comments
```

Assignment accepts `{ "assigneeId": "USER_ID" }` or `{ "assigneeId": null }`. Activity accepts `page` and `pageSize` and returns `{ items, total, page, pageSize }`. Errors use `{ statusCode, message, error }`.

## Verification and commands

Run from the repository root:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

Building first generates shared declarations and Next.js route types. API type checking includes its tests; web type checking also checks browser tests. `pnpm format:check` checks formatting and `pnpm format` rewrites it.

API tests start a disposable MongoDB replica set and do not use the development database. The first run downloads a MongoDB binary; download size varies and can exceed 700 MB on Windows. To use an installed executable instead, set `MONGOMS_SYSTEM_BINARY`. If deliberately using a different MongoDB version, also set `MONGOMS_SYSTEM_BINARY_VERSION_CHECK=false` and run the API test script directly so Turbo does not filter these overrides:

```powershell
$env:MONGOMS_SYSTEM_BINARY = 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe'
$env:MONGOMS_SYSTEM_BINARY_VERSION_CHECK = 'false'
pnpm --filter @projectflow/api test
```

Use the path/version installed on your machine; the example above is the verified Windows environment.

For browser tests:

```bash
pnpm --filter @projectflow/web exec playwright install chromium
pnpm --filter @projectflow/web test:browser
```

Alternatively set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome (`$env:PLAYWRIGHT_CHANNEL='chrome'` in PowerShell). Playwright starts Next.js on `localhost:3743`, uses deterministic API fixtures on port 4734, and writes to a separate `.next-browser` directory. Keep port 3743 free. Failure screenshots/traces are saved under ignored `test-results/`.

### Recorded results: 11 September 2026

| Check                        | Result                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| API integration tests        | 42 passed across 5 suites with isolated replica-set MongoDB                                                                            |
| Playwright                   | 5 passed in Chrome: assignment, failure/retry, keyboard/permissions, pagination/mobile, empty/error recovery                           |
| TypeScript and ESLint        | Passed                                                                                                                                 |
| Production build             | Passed for API, web, and shared package                                                                                                |
| Real application smoke check | Production Next.js + compiled NestJS + seeded isolated MongoDB: login, browser assignment/unassignment, and persisted history verified |
| Visual review                | Desktop and mobile screenshots inspected                                                                                               |

The original real application smoke check used a temporary harness. A repeatable combined deployment smoke test is now committed as `pnpm test:deployment`, alongside Jest and Playwright. Verification was performed in this Windows workspace, not on an independent clean machine. A targeted tracked-file scan found no credential-bearing MongoDB URLs, GitHub tokens, or private-key blocks; private `.env` files were absent from repository history. This is not a comprehensive security audit.

## Assessment deliverables

| PDF requirement                          | Evidence                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Understand the system and identify risks | [ASSESSMENT_NOTES.md](ASSESSMENT_NOTES.md)                             |
| Task assignment                          | Task schema, assignment DTO/service/endpoint, permission tests         |
| Activity history and API                 | Activity schema, transactional writes, pagination/index/batching tests |
| Frontend implementation                  | Assignee selector, activity timeline, Playwright tests                 |
| Production bug                           | [BUG_REPORT.md](BUG_REPORT.md), authorization regression tests         |
| Concurrent task creation                 | Atomic counter, unique index, migration, parallel-create tests         |
| Meaningful testing                       | `apps/api/test` and `apps/web/test/browser`                            |
| Code review exercise                     | Code Review section in assessment notes                                |
| Scaling question                         | Scaling the Activity System section in assessment notes                |
| AI usage and final reflection            | [AI_LOG.md](AI_LOG.md), If I Had Two More Days section in notes        |
| Setup and schema changes                 | This README, `.env.example`, schemas and migration                     |

Before submission, perform a fresh-clone walkthrough, review and be ready to explain the implementation, and record approximate time spent in the careers form. The PDF supplies no numeric scoring weights; feature completion is not a guaranteed assessment score. Hosting is optional and carries no penalty if omitted (brief, page 31).

## Deployment: live on one Heroku app

**Live demo: [ProjectFlow](https://project-flow-d3b5cd641367.herokuapp.com/)**

We chose **one Heroku application (`project-flow`) with one Basic web dyno** for
this assessment demo. It deploys the existing monorepo as one release and exposes
one public domain, keeping hosting configuration simple while retaining separate
Next.js and NestJS applications in the codebase. Both processes share the dyno's
memory and restart/scale together; independent scaling would require separating them.

| Component   | Hosted behavior                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Frontend    | Next.js standalone server listens on Heroku's assigned `PORT`                                           |
| Backend     | NestJS listens internally on `127.0.0.1:4732`                                                           |
| API routing | Next.js forwards `/api/*` to NestJS, removing the `/api` prefix; the browser uses relative `/api` URLs  |
| Database    | Managed MongoDB provided through Rackspace, configured using the `MONGODB_URI` Config Var               |
| Build       | `pnpm heroku-postbuild` builds shared packages and both apps, then packages standalone web assets       |
| Start       | The root `Procfile` starts a supervisor that runs both servers and stops the app if either server exits |

The deployment changes preserve the candidate's original assignment/activity work,
application behavior, and schemas. Local `pnpm dev` still runs the apps separately.
Secrets are configured in Heroku Config Vars, not committed to the repository.
See [HEROKU.md](HEROKU.md) for full setup, environment variables, and operations.

### Demo data and login

The existing demo seed was **executed successfully on the hosted database on
12 September 2026**, creating 5 users, 1 organization, 2 projects, and 9 tasks.
The application's configured database at verification time was `projectFlowV2`.

Use these public demo credentials:

- Email: `ammar@example.com`
- Password: `Password123!`

Seeding is a deliberate one-off operation, not a migration or a step repeated on
every deployment. Normal restarts/redeploys preserve data. The explicit
[`seed:demo` workflow](HEROKU.md#database-setup) resets application collections
and restores the demo dataset when requested; use it only for demonstration data.

### Verified on the deployed app

On 12 September 2026, the Heroku web dyno was running, the hosted seed completed,
and login through the public `/api/auth/login` endpoint returned HTTP 200.
Authenticated API requests through the same domain returned 2 projects and 9 tasks,
confirming the deployed API's connection to the seeded database.

The combined production deployment also passed local browser login,
assignment/unassignment, persisted activity, static asset, and process-failure
cleanup checks on a disposable replica set. Hosted assignment transactions,
POSIX shutdown behavior, and sustained memory/load behavior remain to be verified;
these are separate from the successful public login and data checks above.

## Known limitations and next improvements

- The board fetches at most 100 tasks. Larger-project pagination is future work.
- Activity uses offset pagination; concurrent inserts can shift page boundaries. Only assignee changes are logged.
- Membership removal, notifications, real-time subscriptions, archival/retention jobs, and session-storage redesign are not implemented and are discussed as future work.
- JWTs currently live in localStorage. Production session/security hardening is a separate follow-up.
- CI on an independent clean environment and the remaining hosted checks listed above are outstanding.
- Next.js regenerates `next-env.d.ts` for the active output directory during dev/build/browser checks; those generated import-path changes are not hand-authored feature changes.
