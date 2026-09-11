'use client';

import type { TaskActivityEntry } from '@projectflow/shared';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useTaskActivity } from '../hooks';

function describe(entry: TaskActivityEntry) {
  const previous =
    entry.metadata.from === entry.actor.id
      ? 'themselves'
      : (entry.previousAssignee?.name ?? 'Unknown user');
  const next =
    entry.metadata.to === entry.actor.id
      ? 'themselves'
      : (entry.newAssignee?.name ?? 'Unknown user');
  if (entry.metadata.to === null) return `${entry.actor.name} removed the assignee (${previous})`;
  if (entry.metadata.from === null) return `${entry.actor.name} assigned ${next}`;
  return `${entry.actor.name} changed the assignee from ${previous} to ${next}`;
}

export function TaskActivity({ taskId }: { taskId: string }) {
  const activity = useTaskActivity(taskId);
  const entries = [
    ...new Map(
      (activity.data?.pages.flatMap((page) => page.items) ?? []).map((entry) => [entry.id, entry]),
    ).values(),
  ];
  return (
    <section aria-label="Activity" className="space-y-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold text-foreground">Activity</h2>
      {activity.isPending && (
        <div role="status" aria-label="Loading activity">
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {activity.isError && (
        <div role="alert" className="text-[13px] text-danger">
          <p>Could not load activity: {activity.error.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (activity.isFetchNextPageError) void activity.fetchNextPage();
              else void activity.refetch();
            }}
          >
            Retry activity
          </Button>
        </div>
      )}
      {!activity.isPending && !activity.isError && entries.length === 0 && (
        <p className="text-[13px] text-muted-foreground">No assignment changes yet.</p>
      )}
      <ol className="space-y-4">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2.5">
            <Avatar user={entry.actor} size="sm" />
            <div className="min-w-0">
              <p className="break-words text-[13px] leading-5 text-foreground">{describe(entry)}</p>
              <time dateTime={entry.createdAt} className="text-[11px] text-subtle-foreground">
                {formatDateTime(entry.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ol>
      {activity.hasNextPage && (
        <Button
          variant="secondary"
          size="sm"
          disabled={activity.isFetching}
          onClick={() => void activity.fetchNextPage()}
        >
          {activity.isFetchingNextPage ? 'Loading...' : 'Load more activity'}
        </Button>
      )}
    </section>
  );
}
