# Assessment Notes

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

On the frontend, we have reusable components under a `components` folder, and feature-based folders where each feature has its own components. The important components support the main features on the backend side — like the login form, project creation, and organization creation.

## Where does business logic live?

The business logic lives in the service files on the backend — specifically inside `apps/api/src/*/*.service.ts`.

A clear example is in `apps/api/src/tasks/tasks.service.ts` (lines 59–62), where we create a task for a related project. The logic there checks that the user has access to the project, counts the existing tasks to assign the next task number, and generates the task key based on the project key (e.g. `ENG-4`).

This is real business logic — it is not just saving data to the database, it is enforcing rules like access control, auto-numbering, and key generation.

As an incoming feature, I will add the ability to assign a task to a specific user, which will also live in this service layer.

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

For authorization, we check the current user's role when they try to perform an action. For example, when creating a project, we check that the user is an organization member. This is done through the `ProjectAccessService`, which resolves the user's organization role and project role, and then decides if they can view or manage a project. Organization owners and admins get access to all projects, while regular members need an explicit project membership.

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
