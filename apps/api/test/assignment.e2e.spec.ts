import type { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import request from 'supertest';
import {
  OrganizationRole,
  ProjectRole,
  TaskStatus,
  type TaskActivityEntry,
} from '@projectflow/shared';
import { Activity, type ActivityDocument } from '../src/tasks/schemas/activity.schema';
import { UsersService } from '../src/users/users.service';
import { createTestApp, resetDatabase } from './utils/test-app';
import {
  addOrganizationMember,
  addProjectMember,
  authHeader,
  createOrganization,
  createProject,
  createTask,
  registerUser,
  type TestUser,
} from './utils/fixtures';

describe('Task assignment and history', () => {
  let app: INestApplication;
  let connection: Connection;
  let owner: TestUser;
  let member: TestUser;
  let manager: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let taskId: string;
  let organizationId: string;

  beforeAll(async () => {
    ({ app, connection } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(connection);
    owner = await registerUser(app, 'Owner', 'owner@example.com');
    member = await registerUser(app, 'Member', 'member@example.com');
    manager = await registerUser(app, 'Manager', 'manager@example.com');
    outsider = await registerUser(app, 'Outsider', 'outsider@example.com');
    organizationId = await createOrganization(connection, 'Organization', 'org', owner.id);
    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);
    projectId = await createProject(connection, organizationId, 'Project', 'ENG', owner.id);
    await addProjectMember(connection, projectId, member.id, ProjectRole.MEMBER);
    await addProjectMember(connection, projectId, manager.id, ProjectRole.PROJECT_MANAGER);
    taskId = await createTask(connection, projectId, 'ENG', 1, 'Assignment task', owner.id);
  });
  const assign = (user: TestUser, assigneeId: string | null) =>
    request(app.getHttpServer())
      .patch(`/tasks/${taskId}/assignee`)
      .set('Authorization', authHeader(user))
      .send({ assigneeId });
  const history = (user = member, page = 1, pageSize = 20) =>
    request(app.getHttpServer())
      .get(`/tasks/${taskId}/activity`)
      .set('Authorization', authHeader(user))
      .query({ page, pageSize });

  it('lets members assign and unassign themselves, including completed tasks', async () => {
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Authorization', authHeader(member))
      .send({ status: TaskStatus.DONE })
      .expect(200);
    const result = await assign(member, member.id).expect(200);
    expect(result.body.assignee).toMatchObject({ id: member.id, name: 'Member' });
    await assign(member, null).expect(200);
    const response = await history().expect(200);
    expect(response.body.items.map((entry: TaskActivityEntry) => entry.metadata)).toEqual([
      { from: member.id, to: null },
      { from: null, to: member.id },
    ]);
  });
  it.each(['owner', 'admin', 'manager'])(
    'lets an authorized %s assign another member',
    async (role) => {
      if (role === 'admin')
        await connection
          .collection('organization_members')
          .updateOne(
            { userId: new connection.base.Types.ObjectId(owner.id) },
            { $set: { role: OrganizationRole.ADMIN } },
          );
      await assign(role === 'manager' ? manager : owner, member.id).expect(200);
      await assign(role === 'manager' ? manager : owner, null).expect(200);
    },
  );
  it('rejects assigning another person or unassigning someone else as a regular member', async () => {
    await assign(member, manager.id).expect(403);
    await assign(owner, manager.id).expect(200);
    await assign(member, null).expect(403);
    expect((await history()).body.total).toBe(1);
  });
  it('lets a member replace an existing assignee with themselves', async () => {
    await assign(owner, manager.id).expect(200);
    await assign(member, member.id).expect(200);
    expect((await history()).body.items[0].metadata).toEqual({ from: manager.id, to: member.id });
  });
  it('rejects nonmember assignees, including elevated organization users without project membership', async () => {
    await assign(owner, outsider.id).expect(400);
    await assign(owner, owner.id).expect(400);
    expect((await history()).body.total).toBe(0);
  });
  it('rejects outsiders before validating targets and blocks history access', async () => {
    await assign(outsider, outsider.id).expect(403);
    await history(outsider).expect(403);
    await request(app.getHttpServer()).get(`/tasks/${taskId}/activity`).expect(401);
    expect((await history()).body.total).toBe(0);
  });
  it('records transitions with actor and assignee names, but not no-op assignments', async () => {
    await assign(owner, member.id).expect(200);
    await assign(owner, member.id.toUpperCase()).expect(200);
    await assign(owner, manager.id).expect(200);
    await assign(owner, null).expect(200);
    const response = await history().expect(200);
    expect(response.body.total).toBe(3);
    expect(response.body.items[1]).toMatchObject({
      actor: { id: owner.id },
      previousAssignee: { id: member.id, name: 'Member' },
      newAssignee: { id: manager.id, name: 'Manager' },
      metadata: { from: member.id, to: manager.id },
    });
  });
  it('paginates latest-first with no overlap and rejects invalid pagination', async () => {
    await assign(owner, member.id).expect(200);
    await assign(owner, manager.id).expect(200);
    await assign(owner, null).expect(200);
    const first = await history(member, 1, 2).expect(200);
    const second = await history(member, 2, 2).expect(200);
    expect(first.body.total).toBe(3);
    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(1);
    const ids = [...first.body.items, ...second.body.items].map(
      (entry: TaskActivityEntry) => entry.id,
    );
    expect(new Set(ids).size).toBe(3);
    expect(first.body.items[0].metadata.to).toBeNull();
    await history(member, 0).expect(400);
  });
  it('validates assignment input and missing tasks', async () => {
    for (const body of [{}, { assigneeId: 'invalid' }, { assigneeId: 42 }]) {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch('/tasks/not-an-id/assignee')
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/tasks/${new connection.base.Types.ObjectId()}/assignee`)
      .set('Authorization', authHeader(owner))
      .send({ assigneeId: null })
      .expect(404);
  });
  it('rolls back assignment when writing history fails', async () => {
    const model = app.get<Model<ActivityDocument>>(getModelToken(Activity.name));
    const spy = jest.spyOn(model, 'create').mockImplementationOnce(() => {
      throw new Error('Injected activity failure');
    });
    try {
      await assign(owner, member.id).expect(500);
    } finally {
      spy.mockRestore();
    }
    const task = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', authHeader(member))
      .expect(200);
    expect(task.body.assignedTo).toBeNull();
    expect((await history()).body.total).toBe(0);
  });
  it('serializes concurrent assignments into a consistent history', async () => {
    await Promise.all([
      assign(owner, member.id).expect(200),
      assign(owner, manager.id).expect(200),
    ]);
    const response = await history().expect(200);
    const entries = response.body.items as TaskActivityEntry[];
    expect(entries).toHaveLength(2);
    expect(entries[1]!.metadata.from).toBeNull();
    expect(entries[0]!.metadata.from).toBe(entries[1]!.metadata.to);
    const task = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', authHeader(member))
      .expect(200);
    expect(task.body.assignedTo).toBe(entries[0]!.metadata.to);
  });
  it('retains IDs when referenced users are deleted and removes history with a task', async () => {
    await assign(owner, member.id).expect(200);
    await connection
      .collection('users')
      .deleteOne({ _id: new connection.base.Types.ObjectId(member.id) });
    const response = await history(owner).expect(200);
    expect(response.body.items[0].newAssignee).toMatchObject({
      id: member.id,
      name: 'Unknown user',
    });
    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', authHeader(owner))
      .expect(204);
    expect(await connection.collection('activities').countDocuments()).toBe(0);
  });

  it('resolves actors and assignees in one batch rather than per activity', async () => {
    await assign(owner, member.id).expect(200);
    await assign(owner, manager.id).expect(200);
    const lookup = jest.spyOn(app.get(UsersService), 'findManyByIds');
    try {
      await history().expect(200);
      expect(lookup).toHaveBeenCalledTimes(1);
      const ids = lookup.mock.calls[0]![0].map((id) => id.toString());
      expect(new Set(ids)).toEqual(new Set([owner.id, member.id, manager.id]));
    } finally {
      lookup.mockRestore();
    }
  });

  it('uses the activity ID to paginate deterministically when timestamps tie', async () => {
    await assign(owner, member.id).expect(200);
    await assign(owner, manager.id).expect(200);
    await assign(owner, null).expect(200);
    await connection
      .collection('activities')
      .updateMany({}, { $set: { createdAt: new Date('2026-09-11T00:00:00Z') } });
    const first = await history(member, 1, 2).expect(200);
    const second = await history(member, 2, 2).expect(200);
    const ids = [...first.body.items, ...second.body.items].map(
      (entry: TaskActivityEntry) => entry.id,
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...ids].sort().reverse());
  });
});
