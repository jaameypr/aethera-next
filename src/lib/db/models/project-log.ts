import mongoose, { Schema, type Document, type Model } from "mongoose";

export const PROJECT_LOG_ACTIONS = [
  "SERVER_CREATED",
  "SERVER_DELETED",
  "SERVER_STARTED",
  "SERVER_STOPPED",
  "BACKUP_CREATED",
  "BACKUP_RESTORED",
  "BACKUP_DELETED",
  "BACKUP_STARTED",
  "BACKUP_COMPLETED",
  "BACKUP_FAILED",
  "MEMBER_ADDED",
  "MEMBER_REMOVED",
  "MEMBER_ROLE_CHANGED",
  "SETTINGS_CHANGED",
  "PROJECT_CREATED",
  "PROJECT_UPDATED",
] as const;

export type ProjectLogAction = (typeof PROJECT_LOG_ACTIONS)[number];

export interface IProjectLog extends Document {
  _id: mongoose.Types.ObjectId;
  projectKey: string;
  action: ProjectLogAction;
  actor: mongoose.Types.ObjectId;
  details: Record<string, any>;
  createdAt: Date;
}

const ProjectLogSchema = new Schema<IProjectLog>({
  projectKey: { type: String, required: true },
  action: { type: String, enum: PROJECT_LOG_ACTIONS, required: true },
  actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

ProjectLogSchema.index({ projectKey: 1, createdAt: -1 });

export const ProjectLogModel: Model<IProjectLog> =
  mongoose.models.ProjectLog ||
  mongoose.model<IProjectLog>("ProjectLog", ProjectLogSchema);
