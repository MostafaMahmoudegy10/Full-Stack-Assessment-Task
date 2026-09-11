# Unauthorized task status updates

## Root cause

The starter repository's `PATCH /tasks/:taskId/status` route authenticated callers but did not pass their identity into `TasksService.updateStatus`, which saved the task without project authorization. This defect exists in the upstream starter at `27c84d8`; it was not introduced by the candidate's assignment/activity implementation (`aa5e8d1`).

## Impact

An authenticated outsider who knew a task ID could change its status and receive its detail response. General task edits and deletion already checked project permissions.

## Reproduction

1. Create a task as a project member.
2. Register another user without access to that project.
3. With that user's token, PATCH `/tasks/<id>/status` with `{ "status": "DONE" }`.
4. The new regression test expected 403 but received 200 before the fix.

## Fix

Pass the acting user's ID into the status service and call `ProjectAccessService.assertCanView` before saving. Project members and organization owners/admins retain status-update access. General edit/delete permissions remain unchanged.

## Regression prevention

`tasks.e2e.spec.ts` covers unauthorized status/general edits/deletion, verifies the stored task remains unchanged, and checks allowed status changes by a member and organization owner. Run `pnpm --filter @projectflow/api test` using isolated MongoDB.
