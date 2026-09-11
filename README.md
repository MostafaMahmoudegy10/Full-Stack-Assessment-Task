# ProjectFlow

ProjectFlow is a project and task tracker built with **Next.js, NestJS, and MongoDB** in a TypeScript monorepo. Organizations contain projects, projects contain tasks, and tasks have a creator, an optional assignee, comments, and assignment history.

## Current implementation

All five implementation phases have been merged into `main`. The required feature and production fixes are implemented; a public deployment has not been created or verified.

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

The real application smoke check used a temporary harness; the committed repeatable suites are Jest and Playwright. Verification was performed in this Windows workspace, not on an independent clean machine. A targeted tracked-file scan found no credential-bearing MongoDB URLs, GitHub tokens, or private-key blocks; private `.env` files were absent from repository history. This is not a comprehensive security audit.

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

## Deployment recommendation (not yet performed)

For this assessment demo, the suggested first option is **Vercel for the Next.js frontend and NestJS API as two separate projects, plus MongoDB Atlas**. This is a recommendation, not a verified deployment recipe. Vercel officially supports both [Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs) and [NestJS](https://vercel.com/docs/frameworks/backend/nestjs); the NestJS app runs as a Vercel Function, subject to function limits.

Use project roots `apps/web` and `apps/api`, with access to workspace dependencies and a build that includes `packages/shared`. Vercel documents [separate projects for monorepo directories](https://vercel.com/docs/monorepos). Its [Hobby plan](https://vercel.com/docs/plans/hobby) is free for personal, non-commercial use within its limits; confirm eligibility before selecting it.

**Heroku is a reasonable alternative for the API** if a continuously running Node process is preferred. Its Cedar Basic dyno is listed at $7/month without sleeping; Eco is $5/month for shared hours and sleeps ([official dyno specifications](https://devcenter.heroku.com/articles/dyno-sizes), checked 11 September 2026). The current API reads `API_PORT`, so a Heroku deployment must map or support Heroku's assigned `PORT` and configure a monorepo build/start process before it is ready. No Procfile or verified Heroku setup is included yet.

Before either deployment:

- Configure Atlas access, a separate demo database, and API-only `MONGODB_URI`/`JWT_SECRET` values in the hosting dashboard.
- Set `WEB_ORIGIN` to the frontend origin and `NEXT_PUBLIC_API_URL` to the deployed API URL before building the frontend.
- Validate shared-package builds, database connectivity/transactions, and runtime limits on the actual host. Choose compatible regions for the API and database.
- Run any existing-data migration with writers stopped. Never run the destructive development seed automatically during deployment.
- Verify login, role restrictions, assignment/unassignment, and history on the public URLs before adding a live-demo link. Do not expose production credentials or reuse local-only accounts on real data.

## Known limitations and next improvements

- The board fetches at most 100 tasks. Larger-project pagination is future work.
- Activity uses offset pagination; concurrent inserts can shift page boundaries. Only assignee changes are logged.
- Membership removal, notifications, real-time subscriptions, archival/retention jobs, and session-storage redesign are not implemented and are discussed as future work.
- JWTs currently live in localStorage. Production session/security hardening is a separate follow-up.
- CI on an independent clean environment and public-host verification remain outstanding.
- Next.js regenerates `next-env.d.ts` for the active output directory during dev/build/browser checks; those generated import-path changes are not hand-authored feature changes.
