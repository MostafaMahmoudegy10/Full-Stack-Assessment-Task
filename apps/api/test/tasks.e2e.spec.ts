import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { OrganizationRole, ProjectRole, TaskPriority, TaskStatus } from '@projectflow/shared';
import { migrateTaskNumbering } from '../src/database/migrate-task-numbering';
import { createTestApp, resetDatabase } from './utils/test-app';
import {
  addOrganizationMember,
  addProjectMember,
  authHeader,
  createOrganization,
  createProject,
  registerUser,
  type TestUser,
} from './utils/fixtures';

describe('Tasks', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let projectId: string;

  beforeAll(async () => {
    ({ app, connection } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(connection);

    owner = await registerUser(app, 'Ammar Yaser', 'ammar@example.com');
    member = await registerUser(app, 'Magd Ali', 'magd@example.com');
    outsider = await registerUser(app, 'Outside User', 'outside@example.com');

    const organizationId = await createOrganization(
      connection,
      'Acme Software',
      'acme-software',
      owner.id,
    );
    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);
    await addOrganizationMember(connection, organizationId, member.id, OrganizationRole.MEMBER);

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );
    await addProjectMember(connection, projectId, member.id, ProjectRole.MEMBER);
    // Elevated rights in another organization must never grant access here.
    const outsideOrg = await createOrganization(
      connection,
      'Outside org',
      'outside-org',
      outsider.id,
    );
    await addOrganizationMember(connection, outsideOrg, outsider.id, OrganizationRole.OWNER);
    const outsideProject = await createProject(
      connection,
      outsideOrg,
      'Outside project',
      'OUT',
      outsider.id,
    );
    await addProjectMember(connection, outsideProject, outsider.id, ProjectRole.PROJECT_MANAGER);
  });

  it('lets a project member create a task', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({
        title: 'Improve API error handling',
        description: 'Normalise validation and permission errors.',
        priority: TaskPriority.HIGH,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      key: 'ENG-1',
      number: 1,
      title: 'Improve API error handling',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    });
    expect(response.body.createdBy).toMatchObject({ email: 'magd@example.com' });
  });

  it('numbers tasks sequentially within a project', async () => {
    for (const title of ['First task', 'Second task', 'Third task']) {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', authHeader(member))
        .send({ title })
        .expect(201);
    }

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .expect(200);

    expect(response.body.total).toBe(3);
    expect(response.body.items.map((task: { key: string }) => task.key)).toEqual([
      'ENG-1',
      'ENG-2',
      'ENG-3',
    ]);
  });

  it('refuses to create a task for someone outside the project', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(outsider))
      .send({ title: 'Should not be created' })
      .expect(403);
  });

  it('refuses to list tasks for someone outside the project', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(outsider))
      .expect(403);
  });

  it('rejects a task without a usable title', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'ab' })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
  });

  it('filters the task list by status', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Work in flight', status: TaskStatus.IN_PROGRESS })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Not started yet' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .query({ status: TaskStatus.IN_PROGRESS })
      .set('Authorization', authHeader(member))
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ title: 'Work in flight' });
  });

  it('blocks outsider mutations without changing the task', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Protected task' })
      .expect(201);
    const taskId = created.body.id as string;
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}/status`)
      .set('Authorization', authHeader(outsider))
      .send({ status: TaskStatus.DONE })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/tasks/${taskId}`)
      .set('Authorization', authHeader(outsider))
      .send({ title: 'Unauthorized edit' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/tasks/${taskId}`)
      .set('Authorization', authHeader(outsider))
      .expect(403);
    const result = await request(app.getHttpServer())
      .get(`/tasks/${taskId}`)
      .set('Authorization', authHeader(member))
      .expect(200);
    expect(result.body).toMatchObject({ title: 'Protected task', status: TaskStatus.TODO });
  });

  it('allows member and organization owner status changes', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Allowed status changes' })
      .expect(201);
    for (const user of [member, owner]) {
      await request(app.getHttpServer())
        .patch(`/tasks/${created.body.id}/status`)
        .set('Authorization', authHeader(user))
        .send({ status: TaskStatus.IN_PROGRESS })
        .expect(200);
    }
  });

  it('allocates unique numbers for parallel requests and never reuses deleted numbers', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        request(app.getHttpServer())
          .post(`/projects/${projectId}/tasks`)
          .set('Authorization', authHeader(member))
          .send({ title: `Parallel task ${index}` })
          .expect(201),
      ),
    );
    const numbers = responses.map((response) => response.body.number as number);
    expect(new Set(numbers).size).toBe(20);
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const highest = responses.find((response) => response.body.number === 20)!;
    await request(app.getHttpServer())
      .delete(`/tasks/${highest.body.id}`)
      .set('Authorization', authHeader(owner))
      .expect(204);
    const next = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'After deleting highest' })
      .expect(201);
    expect(next.body.number).toBe(21);
  });

  it('keeps counters independent between projects', async () => {
    const project = await connection
      .collection('projects')
      .findOne({ _id: new connection.base.Types.ObjectId(projectId) });
    const otherId = await createProject(
      connection,
      project!.organizationId.toString(),
      'Other',
      'WEB',
      owner.id,
    );
    for (const id of [projectId, otherId]) {
      const result = await request(app.getHttpServer())
        .post(`/projects/${id}/tasks`)
        .set('Authorization', authHeader(owner))
        .send({ title: 'Independent counter' })
        .expect(201);
      expect(result.body.number).toBe(1);
    }
  });

  it('migrates existing counters from the maximum and preserves larger counters on rerun', async () => {
    const created = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Existing task' })
      .expect(201);
    await connection
      .collection('tasks')
      .updateOne(
        { _id: new connection.base.Types.ObjectId(created.body.id) },
        { $set: { number: 9, key: 'ENG-9' } },
      );
    const filter = { _id: new connection.base.Types.ObjectId(projectId) };
    await connection.collection('projects').updateOne(filter, { $unset: { taskCounter: '' } });
    await migrateTaskNumbering(connection);
    expect((await connection.collection('projects').findOne(filter))!.taskCounter).toBeUndefined();
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Before migration' })
      .expect(400);
    await migrateTaskNumbering(connection, true);
    const next = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'After migration' })
      .expect(201);
    expect(next.body.number).toBe(10);
    await connection.collection('projects').updateOne(filter, { $set: { taskCounter: 50 } });
    await migrateTaskNumbering(connection, true);
    expect((await connection.collection('projects').findOne(filter))!.taskCounter).toBe(50);
    await expect(
      connection.collection('tasks').insertOne({
        projectId: new connection.base.Types.ObjectId(projectId),
        number: 10,
        key: 'ENG-10',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('refuses duplicate legacy data before changing counters or indexes', async () => {
    const tasks = connection.collection('tasks');
    await tasks.dropIndex('projectId_1_number_1');
    await tasks.createIndex({ projectId: 1, number: 1 });
    try {
      await tasks.insertMany(
        [1, 2].map(() => ({
          projectId: new connection.base.Types.ObjectId(projectId),
          number: 7,
          key: 'ENG-7',
        })),
      );
      await expect(migrateTaskNumbering(connection, true)).rejects.toThrow(
        'Duplicate task numbers',
      );
      const project = await connection
        .collection('projects')
        .findOne({ _id: new connection.base.Types.ObjectId(projectId) });
      expect(project!.taskCounter).toBe(0);
      await tasks.deleteMany({});
      await migrateTaskNumbering(connection, true);
      expect(
        (await tasks.indexes()).find((index) => index.name === 'projectId_1_number_1')!.unique,
      ).toBe(true);
    } finally {
      await tasks.deleteMany({});
      await migrateTaskNumbering(connection, true);
    }
  });
});
