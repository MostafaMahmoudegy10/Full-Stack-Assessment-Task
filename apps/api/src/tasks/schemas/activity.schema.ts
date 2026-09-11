import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

export enum ActivityType {
  TASK_ASSIGNEE_CHANGED = 'TASK_ASSIGNEE_CHANGED',
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'activities' })
export class Activity {
  @Prop({ type: String, enum: ActivityType, required: true })
  type: ActivityType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actor: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task', required: true })
  task: Types.ObjectId;

  @Prop({
    type: {
      from: { type: Types.ObjectId, ref: 'User', default: null },
      to: { type: Types.ObjectId, ref: 'User', default: null },
    },
    required: true,
  })
  metadata: {
    from: Types.ObjectId | null;
    to: Types.ObjectId | null;
  };

  createdAt: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

ActivitySchema.index({ task: 1, createdAt: -1, _id: -1 });
