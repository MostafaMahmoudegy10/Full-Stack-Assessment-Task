'use client';

import { useId, useState } from 'react';
import { isElevatedOrganizationRole, ProjectRole, type TaskDetail } from '@projectflow/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/features/auth/hooks';
import { useProject, useProjectMembers } from '@/features/projects/hooks';
import { useAssignTask } from '../hooks';

export function TaskAssigneeSelect({ task }: { task: TaskDetail }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const currentUser = useCurrentUser();
  const project = useProject(task.projectId);
  const members = useProjectMembers(task.projectId);
  const mutation = useAssignTask(task.id, task.projectId);
  const loading = currentUser.isPending || project.isPending || members.isPending;
  const error = currentUser.error ?? project.error ?? members.error;
  const user = currentUser.data;
  const organizationRole = user?.organizations.find(
    (org) => org.id === project.data?.organizationId,
  )?.role;
  const projectRole = members.data?.find((entry) => entry.user.id === user?.id)?.role;
  const canManage =
    isElevatedOrganizationRole(organizationRole ?? null) ||
    projectRole === ProjectRole.PROJECT_MANAGER;
  const canAssign = canManage || projectRole === ProjectRole.MEMBER;
  const assignedTo = task.assignedTo ?? null;
  const canUnassign = canManage || (assignedTo !== null && assignedTo === user?.id);
  const term = search.trim().toLowerCase();
  const matching = (members.data ?? []).filter(
    ({ user: member }) =>
      member.id === assignedTo || `${member.name} ${member.email}`.toLowerCase().includes(term),
  );
  const missingAssignee =
    assignedTo && !members.data?.some((entry) => entry.user.id === assignedTo);

  return (
    <div className="space-y-2" aria-busy={loading || mutation.isPending}>
      <label
        htmlFor={id}
        className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground"
      >
        Assignee
      </label>
      {task.assignee && (
        <p className="break-words text-[13px] text-muted-foreground">{task.assignee.name}</p>
      )}
      {canManage && (members.data?.length ?? 0) > 8 && (
        <Input
          aria-label="Search project members"
          placeholder="Search name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={mutation.isPending}
        />
      )}
      <select
        id={id}
        value={assignedTo ?? ''}
        aria-describedby={`${id}-help`}
        disabled={loading || Boolean(error) || !canAssign || mutation.isPending}
        onChange={(event) => mutation.mutate(event.target.value || null)}
        className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-[13px] text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="" disabled={assignedTo !== null && !canUnassign}>
          Unassigned
        </option>
        {missingAssignee && (
          <option value={assignedTo} disabled>
            {task.assignee?.name ?? 'Unknown user'} (not a member)
          </option>
        )}
        {matching.map(({ user: member }) => (
          <option key={member.id} value={member.id} disabled={!canManage && member.id !== user?.id}>
            {member.name}
            {member.id === user?.id ? ' (you)' : ''}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} role="status" className="text-[12px] text-muted-foreground">
        {loading
          ? 'Loading project members...'
          : mutation.isPending
            ? 'Saving assignment...'
            : !canAssign
              ? 'You do not have permission to change assignment.'
              : members.data?.length === 0
                ? 'No project members available.'
                : term &&
                    !matching.some(({ user: member }) =>
                      `${member.name} ${member.email}`.toLowerCase().includes(term),
                    )
                  ? 'No matching members.'
                  : canManage
                    ? 'Assign a project member or choose Unassigned.'
                    : 'You can assign yourself or remove your own assignment.'}
      </p>
      {error && (
        <div role="alert" className="text-[12px] text-danger">
          <p>Could not load assignment options: {error.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void currentUser.refetch();
              void project.refetch();
              void members.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {mutation.isError && (
        <p role="alert" className="text-[12px] text-danger">
          Assignment was not saved: {mutation.error.message}. Try again.
        </p>
      )}
    </div>
  );
}
