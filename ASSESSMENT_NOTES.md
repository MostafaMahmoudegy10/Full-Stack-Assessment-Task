# Assessment Notes

## Baseline and authorship

The original starter is [engtechno/Full-Stack-Assessment-Task](https://github.com/engtechno/Full-Stack-Assessment-Task), inspected at `27c84d8`. The candidate authored the assignment and activity foundation in `aa5e8d1`: assignee storage, assignment DTO/endpoint and permissions, activity schema/logging, authorized paginated activity retrieval, batched actor lookup, and shared response types. These were candidate additions, not starter features. The later candidate commit `9432dd2` also added the activity ID tie-breaker index and removed debug logging; it was discovered on remote main during final integration and preserved. The subsequent five PRs extend that work with consistency, UI, tests, documentation, and fixes to the starter's authorization and numbering defects.

## How is the application structured, and what are the major modules?

It is an application that contains the frontend codebase with the backend codebase in one monorepo, so:

- **Backend** lives under `apps/api/**`
- **Frontend** lives under `apps/web/**`

### Backend Structure

The backend is structured as follows:

- **auth** → for authenticating users and returning the JWT access token
- **users** → user management
- **organizations** → organization management
- **organization-members** → membership within organizations
- **projects** → project management
- **project-members** → membership within projects
- **tasks** → task management within projects
- **comments** → comments on tasks

So until now, a user logs in, and the user can be a project member or an organization member. Tasks are part of projects — each project contains multiple tasks, and the organization can create multiple projects through their own members.

**Major modules:**

- Organizations
- Users
- Projects

### Frontend Structure

On the frontend, we have reusable components under a `components` folder, and feature-based folders where each feature has its own components. The important components support the main features on the backend side — like login, project listing, task creation/details, comments, and the assignment/activity interface. Organization and project creation interfaces are not implemented in the starter frontend.

## Where does business logic live?

The business logic lives in the service files on the backend — specifically inside `apps/api/src/*/*.service.ts`.

A clear example is `TasksService`: it checks project access, reserves a task number using an atomic project-counter increment, generates a key such as `ENG-4`, and persists the task. Assignment permissions and activity writes also live here. Assignment and its activity record are committed in one transaction; a retry reads the current assignee again before generating history.

## How are the main entities related?

The entities are related through reference IDs stored as fields in each schema (MongoDB ObjectId references):

- **Organization** → stands on its own, has an `ownerId` pointing to a User.
- **OrganizationMember** → links a User to an Organization through `organizationId` + `userId`, with a `role`.
- **Project** → belongs to an Organization through `organizationId`, and tracks who created it via `createdBy` (User).
- **ProjectMember** → links a User to a Project through `projectId` + `userId`, with a `role`.
- **Task** → belongs to a Project through `projectId`, and tracks the creator via `createdBy` (User).
- **Comment** → belongs to a Task through `taskId`, and tracks the author via `authorId` (User).

So the chain goes: **Organization → Project → Task → Comment**, and Users are connected to Organizations and Projects through their respective member tables (OrganizationMember, ProjectMember).

## How are authentication and authorization implemented?

### Authentication

Authentication is handled through JWT. The `JwtAuthGuard` is registered globally — it runs on every request. It takes the token from the `Authorization` header (Bearer token), validates it using `JwtService.verifyAsync()`, and extracts the payload (`sub` and `email`). It then creates a `user` object and attaches it to the request so downstream controllers can use it.

### Public routes

We have a `@Public()` decorator that uses `SetMetadata` to mark specific routes as public. When the guard sees that a route is marked with `@Public()`, it skips the token validation entirely — so endpoints like login and register don't need a Bearer token.

### Current User

We have a `@CurrentUser()` decorator that reads the user object that the guard attached to the request. Controllers use this to know who is making the request.

### Authorization

For authorization, we check the current user's role when they try to perform an action. For example, when creating a project, we require an organization OWNER or ADMIN; ordinary organization membership is insufficient. This is done through the `ProjectAccessService`, which resolves the user's organization role and project role, and then decides if they can view or manage a project. Organization owners and admins get access to all projects, while regular members need an explicit project membership.

## How does the frontend talk to the backend, and how is server state handled?

### Frontend-to-Backend Communication

Communication is centralized through a custom API client:

- **Centralized Client (`apps/web/src/lib/api-client.ts`)**: An `apiRequest()` wrapper built on top of native `fetch`. It handles the base URL (`NEXT_PUBLIC_API_URL`), sets JSON headers, and constructs query parameters.
- **Authentication**: Automatically attaches the JWT Bearer token stored in `localStorage` (via `auth-storage.ts`) on authenticated requests. It provides an `anonymous: true` option for public endpoints like login and registration.
- **Error Handling**: Formats API responses and throws custom `ApiError` instances containing the HTTP status code and message.
- **Feature API Modules**: Under each feature directory (e.g., `features/projects/api.ts`, `features/tasks/api.ts`), domain-specific functions wrap `apiRequest` with explicit TypeScript types for parameters and responses.

### Server State Management

Server state is handled using **TanStack React Query** (`@tanstack/react-query`):

- **Query Provider (`apps/web/src/providers/query-provider.tsx`)**: Configures the global `QueryClient` with sensible defaults:
  - `staleTime: 30_000` (30 seconds) to avoid immediate re-fetching.
  - `refetchOnWindowFocus: false`.
  - Smart retry strategy: 4xx client/auth errors fail immediately without retrying, while 5xx server errors retry up to 2 times.
- **Centralized Query Keys (`apps/web/src/lib/query-keys.ts`)**: Defines an explicit registry of query key factories (e.g. `queryKeys.projects`, `queryKeys.project(id)`, `queryKeys.projectTasks(id)`) ensuring consistent cache management and predictable invalidation.
- **Custom Hooks**: Encapsulated within feature folders (e.g., `useProjects()`, `useProject(id)` in `features/projects/hooks.ts`) to keep components clean and decouple UI from data fetching logic.

## Risks and prioritization

| Observation                                                      | Why it matters                                                                                                | Decision and reason                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Starter status updates omitted project authorization             | An authenticated user could modify a task in another project and receive its details                          | Fixed now; it is the reported production defect, with a failing-before/passing-after regression               |
| Starter numbering used task count plus one                       | Concurrent requests and deletion could reuse identifiers                                                      | Fixed now with atomic counters, a unique index, and a migration                                               |
| Initial assignment/activity saves were separate                  | A failed log insert could leave an unrecorded assignment; concurrent requests could record stale predecessors | Improved now with transactions and rollback/concurrency tests because history must describe committed changes |
| Board fetches only the first 100 tasks                           | Larger projects silently omit later tasks                                                                     | Later: implement explicit paging or per-column fetching; unrelated to the requested assignment UI             |
| JWT is stored in localStorage with a long lifetime               | A successful script injection can read the token; logout does not revoke a stolen token                       | Later: review session lifetime, secure cookie/refresh design and CSRF implications together                   |
| Membership checks are not transactionally coupled to every write | A future concurrent membership-removal feature could introduce access races                                   | Later: design revocation semantics when adding removal; current membership API only adds members              |

## Implementation decisions

- Members may assign themselves, including replacing another assignee, and remove only their own assignment. Owners/admins/project managers may assign project members or unassign anyone. Elevated organization status alone does not make a user an eligible assignee.
- Assignment is available in every status. The earlier DONE restriction was removed because the brief keeps status rules unchanged.
- MongoDB transactions keep assignment/activity and task deletion cleanup consistent. A replica set is required; tests create their own disposable one-node replica set. No message queue or database replacement was introduced.
- Reassigning to the same user is a no-op without a duplicate activity record. IDs are normalized before comparison. Missing users retain their identifiers and appear as Unknown user.
- Task responses retain `assignedTo` for compatibility and add a nullable user summary. Activity keeps its original ID metadata and adds previous/new assignee summaries, resolved in one batched lookup.
- Activity uses offset pagination for the current scale, sorted by timestamp and ID, supported by a matching compound index. Only assignee changes are tracked.
- Atomic project counters guarantee unique reservations across application instances; a unique compound index enforces the invariant in MongoDB. Failed inserts may leave gaps. Existing data is migrated with writes stopped; duplicates require deliberate resolution and are never silently renumbered.
- UI saves are server-confirmed. Pending controls are disabled; rejected requests retain the displayed value. Successful saves update the task cache and invalidate the task list and history. Search is client-side for projects with more than eight members.
- Playwright is the only new library, a development dependency that tests actual browser behavior including keyboard selection, narrow screens, error recovery, and cache updates. Browser fixtures isolate UI behavior; API tests independently exercise real MongoDB and NestJS.

## Code Review

Review of the assessment's supplied `assignTask(taskId, assigneeId, userId)` snippet:

1. **Blocking: authorization.** `userId` is unused. A signed-in caller could assign tasks they cannot access. Resolve project access and enforce elevated-role versus self-assignment rules in the service, not just the controller or UI.
2. **Blocking: eligible assignees.** Finding a user proves existence, not project membership. Validate membership in the task's project, including for elevated organization users. Add cross-project and forbidden-role tests.
3. **Blocking: unassignment and history.** Support explicit null for authorized unassignment and record null-to-user, user-to-user, and user-to-null transitions. Skip no-op changes. Persist the task and event transactionally, reading the previous value on each retry so concurrent changes produce accurate history.
4. **Validation and errors.** Validate input IDs and required fields at the boundary. Preserve consistent 400/403/404 responses and handle missing tasks/users without leaking inaccessible project details. Do not let an invalid ObjectId become an unhandled database error.
5. **API boundary and maintainability.** Return the existing serialized task response rather than a raw Mongoose document. Reuse project-access and user services rather than creating a second permission policy.
6. **Performance.** The snippet itself has a fixed query count, so I would not call it an N+1 issue. For listing history, batch actor/assignee resolution and add an index matching the authorized task-scoped query. Avoid fetching unrelated user fields.

I would request these behavior changes and regression tests before approval, rather than rewriting the method simply for style.

## Scaling the Activity System

At roughly 5,000 users, I would keep the current MongoDB collection and synchronous transactional write. The first step toward 500,000 users is measuring events per day, events per busy task, document size, index working-set size, read/write latency, and transaction retry rates. User count alone does not justify a queue, shard, or cache.

**Indexes and queries.** Keep reads scoped to an authorized task and project. The `(task, createdAt desc, _id desc)` index supports the timeline order; inspect query plans and examined-to-returned document ratios using realistic busy-task data. Project only the fields needed and keep user resolution batched. An exact count on every page grows expensive, so a later API can expose `hasMore` instead of `total`. Add further indexes only for measured access patterns, because each index consumes storage and write capacity.

**Pagination.** Offset pagination is simple at today's depth. As deep pages or frequent inserts become common, move to a cursor containing `(createdAt, _id)` and fetch records strictly older than that tuple using the same sort order. Fetch one extra record to determine whether another page exists. Validate cursor shape and continue checking task access on every request; a cursor is not authorization. During transition, keep the old endpoint behavior for existing clients and add a versioned or explicitly selected cursor response. The UI can retain already loaded records by ID and offer a refresh when new activity arrives.

**Growth, retention, and archiving.** Measure retained events and storage forecasts, then agree a retention policy with product and compliance stakeholders. Do not add automatic expiration to an audit-like history without an explicit retention decision. Older immutable records can be copied to cheaper archive storage with checksums, partition manifests, restore tests, and an authorized retrieval path. Verify archive completeness before removing hot records in bounded background batches. A task's history should state any retention boundary instead of suggesting it never had older events.

**Asynchronous work.** Keep the assignment and durable event/outbox write in the same transaction. If notification fan-out, indexing, or analytics makes writes slow, move those downstream effects to background workers. A transactionally written outbox prevents a successful task update with a lost queue message. Consumers use event IDs for idempotency, bounded retries, backoff, and a dead-letter/replay workflow. A queue is useful when there is measured deferred work; replacing the transactional event write with fire-and-forget processing would weaken the feature's guarantee.

**Realtime and caching.** Add authorized SSE or WebSocket subscriptions only if teams need immediate updates from other users. Publish after commit, allow reconnection/backfill from the durable timeline, and recheck access when subscriptions change. The current query cache is enough initially. If repeated first-page reads dominate, consider a short-lived server cache keyed by task and query parameters, with authorization outside the cache and commit-driven invalidation. Never share cached task data across access boundaries accidentally.

**Operational triggers.** Monitor p95/p99 read and assignment latency, write conflicts, pool saturation, index usage, archive-job progress, queue lag/retries, and missing-event reconciliation. Load-test unusually busy projects and tasks, not only uniformly distributed users. Scale database resources first when evidence supports it; consider partitioning/sharding only after measuring capacity and choosing a key that preserves task-local reads without creating a hotspot. Each change should have a measurable acceptance target and a rollback path that preserves events.

## If I Had Two More Days

1. Add broader browser-to-real-API coverage and CI on a clean Linux/Windows environment, plus repeated high-contention transaction tests. This most directly protects delivery correctness.
2. Fix the board's 100-task limit and test large-project navigation, empty filtered views, and loading additional tasks.
3. Review token lifetime/revocation and cookie-based sessions with an explicit CSRF plan, rather than making an isolated storage change.
4. Add operational metrics for assignment failures, transaction retries, slow activity queries, and migration checks. Measure before introducing caching or queues.
5. Improve long-history UX with cursor pagination and refresh indicators, and design membership-removal/retention rules before adding those capabilities.
