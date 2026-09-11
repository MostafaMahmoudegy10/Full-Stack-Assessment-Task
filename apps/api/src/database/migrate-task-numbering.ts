import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import mongoose, { type Connection, type Types } from 'mongoose';

/** Run with task writes stopped. Default is inspection only; never renumber tasks silently. */
export async function migrateTaskNumbering(connection: Connection, apply = false) {
  const tasks = connection.collection('tasks');
  const projects = connection.collection('projects');
  const duplicates = await tasks
    .aggregate([
      { $group: { _id: { projectId: '$projectId', number: '$number' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
  if (duplicates.length) {
    throw new Error(
      `Duplicate task numbers must be resolved before migration: ${JSON.stringify(duplicates)}`,
    );
  }
  const maxima = await tasks
    .aggregate<{
      _id: Types.ObjectId;
      maximum: number;
    }>([{ $group: { _id: '$projectId', maximum: { $max: '$number' } } }])
    .toArray();
  const maximumByProject = new Map(maxima.map((row) => [row._id.toString(), row.maximum]));
  const existingProjects = await projects.find({}, { projection: { _id: 1 } }).toArray();
  if (apply) {
    for (const project of existingProjects) {
      await projects.updateOne(
        { _id: project._id },
        {
          $max: { taskCounter: maximumByProject.get(project._id.toString()) ?? 0 },
        },
      );
    }
    // The starter used the same key pattern without uniqueness. Keep other indexes intact.
    const indexes = await tasks.indexes();
    for (const index of indexes) {
      if (
        index.key.projectId === 1 &&
        index.key.number === 1 &&
        Object.keys(index.key).length === 2 &&
        !index.unique &&
        index.name
      ) {
        await tasks.dropIndex(index.name);
      }
    }
    await tasks.createIndex({ projectId: 1, number: 1 }, { unique: true });
  }
  return { applied: apply, projects: existingProjects.length, duplicateGroups: 0 };
}

if (require.main === module) {
  loadEnv({ path: resolve(__dirname, '../../../../.env'), quiet: true });
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  void (async () => {
    try {
      await mongoose.connect(uri, { autoIndex: false });
      console.warn(
        await migrateTaskNumbering(mongoose.connection, process.argv.includes('--apply')),
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Migration failed');
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}
