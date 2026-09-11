import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type FilterQuery, Model, Types } from 'mongoose';
import {
  ProjectRole,
  type Paginated,
  type TaskActivityEntry,
  type TaskDetail,
  type TaskSummary,
} from '@projectflow/shared';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { toObjectId } from '../common/utils/object-id';
import { toUserSummary } from '../common/utils/serialize';
import { Comment, type CommentDocument } from '../comments/schemas/comment.schema';
import { canManage, ProjectAccessService } from '../projects/project-access.service';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema';
import { UsersService } from '../users/users.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto } from './dto/list-tasks.dto';
import type { ListTaskActivityDto } from './dto/list-task-activity.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { Activity, ActivityType, type ActivityDocument } from './schemas/activity.schema';
import { Task, type TaskDocument } from './schemas/task.schema';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Activity.name) private readonly activityModel: Model<ActivityDocument>,
    private readonly projectAccessService: ProjectAccessService,
    private readonly usersService: UsersService,
  ) {}

  async findByProject(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
    query: ListTasksQueryDto,
  ): Promise<Paginated<TaskSummary>> {
    await this.projectAccessService.assertCanView(projectId, userId);

    const filter: FilterQuery<TaskDocument> = { projectId };
    if (query.status) {
      filter.status = query.status;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }

    const [tasks, total] = await Promise.all([
      this.taskModel.find(filter).sort({ number: 1 }).skip(query.skip).limit(query.pageSize).exec(),
      this.taskModel.countDocuments(filter),
    ]);

    return {
      items: await this.toSummaries(tasks),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(
    projectId: Types.ObjectId, // the project the task belongs to
    userId: Types.ObjectId, // the user creating the task
    dto: CreateTaskDto, // the data for the new task
  ): Promise<TaskDetail> {
    const { project } = await this.projectAccessService.assertCanView(projectId, userId); // ensure the user can view the project

    const reserved = await this.projectModel
      .findOneAndUpdate(
        { _id: projectId, taskCounter: { $gte: 0 } },
        { $inc: { taskCounter: 1 } },
        { new: true },
      )
      .exec();
    if (!reserved) {
      throw new BadRequestException(
        'Project task counter is not initialized; run the task-numbering migration',
      );
    }
    const number = reserved.taskCounter;

    const task = await this.taskModel.create({
      // create the new task
      projectId,
      number,
      key: `${project.key}-${number}`,
      title: dto.title,
      description: dto.description ?? null,
      status: dto.status,
      priority: dto.priority,
      createdBy: userId,
    });

    return this.toDetail(task, project);
  }

  async findOne(taskId: Types.ObjectId, userId: Types.ObjectId): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const { project } = await this.projectAccessService.assertCanView(task.projectId, userId);

    return this.toDetail(task, project);
  }

  async update(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const access = await this.projectAccessService.assertCanView(task.projectId, userId);

    const isCreator = task.createdBy.equals(userId);
    if (!canManage(access) && !isCreator) {
      throw new ForbiddenException('You do not have permission to edit this task');
    }

    if (dto.title !== undefined) {
      task.title = dto.title;
    }
    if (dto.description !== undefined) {
      task.description = dto.description;
    }
    if (dto.status !== undefined) {
      task.status = dto.status;
    }
    if (dto.priority !== undefined) {
      task.priority = dto.priority;
    }

    await task.save();

    return this.toDetail(task, access.project);
  }

  async updateStatus(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);

    await this.projectAccessService.assertCanView(task.projectId, userId);
    task.status = dto.status;
    await task.save();

    return this.toDetail(task);
  }

  async remove(taskId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
    const task = await this.findTaskOrFail(taskId);
    await this.projectAccessService.assertCanManage(task.projectId, userId);

    await this.taskModel.db.transaction(async (session) => {
      await this.taskModel.deleteOne({ _id: task._id }, { session });
      await this.commentModel.deleteMany({ taskId: task._id }, { session });
      await this.activityModel.deleteMany({ task: task._id }, { session });
    });
  }

  async findTaskOrFail(taskId: Types.ObjectId): Promise<TaskDocument> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async findActivity(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    query: ListTaskActivityDto,
  ): Promise<Paginated<TaskActivityEntry>> {
    const task = await this.findTaskOrFail(taskId);
    await this.projectAccessService.assertCanView(task.projectId, userId);

    const [activities, total] = await Promise.all([
      this.activityModel
        .find({ task: task._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip(query.skip)
        .limit(query.pageSize)
        .exec(),
      this.activityModel.countDocuments({ task: task._id }),
    ]);

    if (activities.length === 0) {
      return { items: [], total, page: query.page, pageSize: query.pageSize };
    }

    const actorIds = [
      ...new Map(
        activities
          .flatMap((activity) => [activity.actor, activity.metadata.from, activity.metadata.to])
          .filter((id): id is Types.ObjectId => id != null)
          .map((id) => [id.toString(), id]),
      ).values(),
    ];
    const actors = await this.usersService.findManyByIds(actorIds);
    const actorsById = new Map(actors.map((actor) => [actor._id.toString(), actor]));

    return {
      items: activities.map((activity) => ({
        id: activity._id.toString(),
        type: activity.type,
        actor: toCreatorSummary(
          actorsById.get(activity.actor.toString()),
          activity.actor.toString(),
        ),
        previousAssignee: activity.metadata.from
          ? toCreatorSummary(
              actorsById.get(activity.metadata.from.toString()),
              activity.metadata.from.toString(),
            )
          : null,
        newAssignee: activity.metadata.to
          ? toCreatorSummary(
              actorsById.get(activity.metadata.to.toString()),
              activity.metadata.to.toString(),
            )
          : null,
        taskId: task._id.toString(),
        metadata: {
          from: activity.metadata.from?.toString() ?? null,
          to: activity.metadata.to?.toString() ?? null,
        },
        createdAt: activity.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async toSummaries(tasks: TaskDocument[]): Promise<TaskSummary[]> {
    if (tasks.length === 0) {
      return [];
    }

    const [creators, commentRows] = await Promise.all([
      this.usersService.findManyByIds(
        tasks.flatMap((task) =>
          task.assignee ? [task.createdBy, task.assignee] : [task.createdBy],
        ),
      ),
      this.commentModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { taskId: { $in: tasks.map((task) => task._id) } } },
          { $group: { _id: '$taskId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const creatorsById = new Map(creators.map((user) => [user._id.toString(), user]));
    const commentCounts = new Map(commentRows.map((row) => [row._id.toString(), row.count]));

    return tasks.map((task) => ({
      id: task._id.toString(),
      projectId: task.projectId.toString(),
      number: task.number,
      key: task.key,
      title: task.title,
      status: task.status,
      priority: task.priority,
      commentCount: commentCounts.get(task._id.toString()) ?? 0,
      assignedTo: task.assignee?.toString() ?? null,
      assignee: task.assignee
        ? toCreatorSummary(creatorsById.get(task.assignee.toString()), task.assignee.toString())
        : null,
      createdBy: toCreatorSummary(creatorsById.get(task.createdBy.toString())),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));
  }

  async assignTask(
    taskId: string,
    assigneeId: string | null,
    currentUser: AuthenticatedUser,
  ): Promise<TaskDetail> {
    const id = toObjectId(taskId, 'task id');
    const currentUserId = toObjectId(currentUser.id, 'user id');
    const assigneeObjectId = assigneeId === null ? null : toObjectId(assigneeId, 'assignee id');

    await this.taskModel.db.transaction(async (session) => {
      // Re-read on every transaction retry so history describes the committed predecessor.
      const task = await this.taskModel.findById(id).session(session).exec();
      if (!task) throw new NotFoundException('Task not found');
      const access = await this.projectAccessService.assertCanView(task.projectId, currentUserId);
      const isSelfAssignment = assigneeObjectId?.equals(currentUserId) ?? false;
      const isSelfUnassignment =
        assigneeObjectId === null && (task.assignee?.equals(currentUserId) ?? false);
      if (
        !canManage(access) &&
        (access.projectRole !== ProjectRole.MEMBER || (!isSelfAssignment && !isSelfUnassignment))
      ) {
        throw new ForbiddenException('You do not have permission to assign this task');
      }
      if (
        assigneeObjectId &&
        !(await this.projectAccessService.isMember(task.projectId, assigneeObjectId))
      ) {
        throw new BadRequestException('Assignee must be a member of this project');
      }
      if ((task.assignee?.toString() ?? null) === (assigneeObjectId?.toString() ?? null)) return;
      const previousAssignee = task.assignee ?? null;
      task.assignee = assigneeObjectId;
      await task.save({ session });
      await this.activityModel.create(
        [
          {
            type: ActivityType.TASK_ASSIGNEE_CHANGED,
            actor: currentUserId,
            task: task._id,
            metadata: { from: previousAssignee, to: assigneeObjectId },
          },
        ],
        { session },
      );
    });
    return this.findOne(id, currentUserId);
  }

  private async toDetail(task: TaskDocument, project?: ProjectDocument): Promise<TaskDetail> {
    const [summary] = await this.toSummaries([task]);
    const resolvedProject = project ?? (await this.projectModel.findById(task.projectId).exec());

    if (!resolvedProject) {
      throw new NotFoundException('Project not found');
    }

    return {
      ...summary!,
      description: task.description ?? null,
      project: {
        id: resolvedProject._id.toString(),
        name: resolvedProject.name,
        key: resolvedProject.key,
      },
    };
  }
}

const DELETED_USER = {
  id: '',
  name: 'Unknown user',
  email: '',
  avatarUrl: null,
};

function toCreatorSummary(user: Parameters<typeof toUserSummary>[0] | undefined, id = '') {
  return user ? toUserSummary(user) : { ...DELETED_USER, id };
}
