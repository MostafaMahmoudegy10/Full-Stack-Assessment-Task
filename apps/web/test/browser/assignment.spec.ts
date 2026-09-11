import { test, expect, type Page } from '@playwright/test';
import type { TaskActivityEntry, TaskDetail, UserSummary } from '@projectflow/shared';

const owner: UserSummary = { id: 'owner', name: 'Owner', email: 'owner@example.com' };
const member: UserSummary = { id: 'member', name: 'Member', email: 'member@example.com' };
const other: UserSummary = { id: 'other', name: 'Other member', email: 'other@example.com' };
const project = {
  id: 'project',
  organizationId: 'org',
  name: 'Demo project',
  key: 'ENG',
  organization: { id: 'org', name: 'Demo org', slug: 'demo' },
  createdBy: owner,
  memberCount: 10,
  taskCount: 1,
  createdAt: '2026-09-11T08:00:00.000Z',
  updatedAt: '2026-09-11T08:00:00.000Z',
};

async function setup(page: Page, role: 'owner' | 'member' = 'owner', historyCount = 0) {
  const user = role === 'owner' ? owner : member;
  const users = [
    member,
    other,
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `extra${i}`,
      name: `Extra ${i}`,
      email: `extra${i}@example.com`,
    })),
  ];
  const state = {
    failSave: false,
    failMembers: false,
    failActivity: false,
    noMembers: false,
    holdSave: false,
    release: () => {},
  };
  let task: TaskDetail = {
    id: 'task',
    projectId: 'project',
    number: 1,
    key: 'ENG-1',
    title: 'Assignment browser test',
    description: 'Verify assignment and activity.',
    status: 'TODO' as TaskDetail['status'],
    priority: 'MEDIUM' as TaskDetail['priority'],
    commentCount: 0,
    createdBy: owner,
    assignedTo: null,
    assignee: null,
    project,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  const entries: TaskActivityEntry[] = Array.from({ length: historyCount }, (_, i) => ({
    id: `entry${i}`,
    type: 'TASK_ASSIGNEE_CHANGED',
    actor: owner,
    taskId: task.id,
    metadata: { from: null, to: member.id },
    previousAssignee: null,
    newAssignee: member,
    createdAt: new Date(Date.parse(project.createdAt) - i * 1000).toISOString(),
  }));
  await page.addInitScript(() =>
    localStorage.setItem('projectflow.accessToken', 'test-only-token'),
  );
  await page.route('http://127.0.0.1:4734/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const send = (json: unknown, status = 200) => route.fulfill({ status, json });
    if (path === '/auth/me')
      return send({
        ...user,
        organizations: [{ ...project.organization, role: role === 'owner' ? 'OWNER' : 'MEMBER' }],
      });
    if (path === '/projects') return send([project]);
    if (path === '/projects/project') return send(project);
    if (path === '/projects/project/members')
      return state.failMembers
        ? send({ message: 'Members unavailable' }, 403)
        : send(
            state.noMembers
              ? []
              : users.map((user) => ({
                  id: user.id,
                  projectId: project.id,
                  role: 'MEMBER',
                  user,
                  createdAt: project.createdAt,
                })),
          );
    if (path === '/tasks/task') return send(task);
    if (path === '/tasks/task/comments')
      return send({ items: [], total: 0, page: 1, pageSize: 50 });
    if (path === '/tasks/task/activity') {
      if (state.failActivity) return send({ message: 'Activity unavailable' }, 403);
      const number = Number(url.searchParams.get('page') ?? 1);
      return send({
        items: entries.slice((number - 1) * 20, number * 20),
        total: entries.length,
        page: number,
        pageSize: 20,
      });
    }
    if (path === '/tasks/task/assignee') {
      if (state.holdSave)
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      if (state.failSave) return send({ message: 'Permission changed' }, 403);
      const { assigneeId } = request.postDataJSON() as { assigneeId: string | null };
      const assignee = users.find((user) => user.id === assigneeId) ?? null;
      entries.unshift({
        id: `change${entries.length}`,
        type: 'TASK_ASSIGNEE_CHANGED',
        actor: user,
        taskId: task.id,
        metadata: { from: task.assignedTo ?? null, to: assigneeId },
        previousAssignee: task.assignee ?? null,
        newAssignee: assignee,
        createdAt: new Date().toISOString(),
      });
      task = { ...task, assignedTo: assigneeId, assignee };
      return send(task);
    }
    return send({ message: `Unexpected mock route: ${path}` }, 404);
  });
  return state;
}

const openTask = (page: Page) => page.goto('/projects/project/tasks/task');

test('owner searches, assigns, unassigns and sees refreshed activity without navigation', async ({
  page,
}) => {
  await setup(page);
  await openTask(page);
  await expect(page.getByText('No assignment changes yet.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search project members' }).fill('member@example.com');
  const selector = page.getByLabel('Assignee', { exact: true });
  await selector.selectOption('member');
  await expect(selector).toHaveValue('member');
  await expect(page.getByText('Owner assigned Member', { exact: true })).toBeVisible();
  await selector.selectOption('');
  await expect(
    page.getByText('Owner removed the assignee (Member)', { exact: true }),
  ).toBeVisible();
  await expect(selector).toHaveValue('');
});

test('failed saves retain the current value and allow retry; saving disables the selector', async ({
  page,
}) => {
  const state = await setup(page);
  await openTask(page);
  const selector = page.getByLabel('Assignee', { exact: true });
  state.holdSave = true;
  state.failSave = true;
  await selector.selectOption('member');
  await expect(selector).toBeDisabled();
  await expect(page.getByText('Saving assignment...')).toBeVisible();
  state.release();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Assignment was not saved' }),
  ).toContainText('Permission changed');
  await expect(selector).toHaveValue('');
  state.holdSave = false;
  state.failSave = false;
  await selector.selectOption('member');
  await expect(selector).toHaveValue('member');
  await expect(page.getByText('Owner assigned Member', { exact: true })).toBeVisible();
});

test('members can only select themselves and remove their own assignment', async ({ page }) => {
  await setup(page, 'member');
  await openTask(page);
  const selector = page.getByLabel('Assignee', { exact: true });
  await expect(selector.locator('option[value="other"]')).toBeDisabled();
  await selector.focus();
  await expect(selector).toBeFocused();
  await selector.press('ArrowDown');
  await selector.press('Enter');
  await expect(selector).toHaveValue('member');
  await expect(page.getByText('Member assigned themselves', { exact: true })).toBeVisible();
  await selector.selectOption('');
  await expect(
    page.getByText('Member removed the assignee (themselves)', { exact: true }),
  ).toBeVisible();
});

test('activity pagination and mobile layout remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, 'owner', 21);
  await openTask(page);
  const activity = page.getByRole('region', { name: 'Activity', exact: true });
  await expect(activity.getByRole('listitem')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more activity' }).click();
  await expect(activity.getByRole('listitem')).toHaveCount(21);
  await expect(page.getByRole('button', { name: 'Load more activity' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/assignment-mobile.png', fullPage: true });
});

test('member and activity errors offer retry; empty membership is explained', async ({ page }) => {
  const state = await setup(page);
  state.failMembers = true;
  state.failActivity = true;
  await openTask(page);
  await expect(page.getByLabel('Assignee', { exact: true })).toBeDisabled();
  await expect(
    page.getByText('Could not load assignment options:', { exact: false }),
  ).toBeVisible();
  state.failMembers = false;
  state.failActivity = false;
  state.noMembers = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Retry activity', exact: true }).click();
  await expect(page.getByText('No project members available.')).toBeVisible();
  await expect(page.getByText('No assignment changes yet.')).toBeVisible();
});
