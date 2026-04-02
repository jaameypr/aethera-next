import mongoose, { Schema, type Document, type Model } from "mongoose";

export type BackupComponent = "world" | "config" | "mods" | "plugins" | "datapacks";
export type BackupStatus = "pending" | "in_progress" | "completed" | "failed";
export type BackupStrategy = "sync" | "async" | "import";

export interface IBackup extends Document {
  _id: mongoose.Types.ObjectId;
  serverId: mongoose.Types.ObjectId;
  name: string;
  filename: string;
  path: string;
  size: number;
  components: BackupComponent[];
  status: BackupStatus;
  strategy: BackupStrategy;
  jobId?: string;
  shareUrl?: string;
  shareId?: string;
  errorMessage?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const BackupSchema = new Schema<IBackup>({
  serverId: { type: Schema.Types.ObjectId, ref: "Server", required: true },
  name: { type: String, required: true, trim: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  size: { type: Number, default: 0 },
  components: [{ type: String, enum: ["world", "config", "mods", "plugins", "datapacks"] }],
  status: { type: String, enum: ["pending", "in_progress", "completed", "failed"], default: "completed" },
  strategy: { type: String, enum: ["sync", "async", "import"], default: "sync" },
  jobId: { type: String },
  shareUrl: { type: String },
  shareId: { type: String },
  errorMessage: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

BackupSchema.index({ serverId: 1, createdAt: -1 });
BackupSchema.index({ jobId: 1 }, { sparse: true });

export const BackupModel: Model<IBackup> =
  mongoose.models.Backup || mongoose.model<IBackup>("Backup", BackupSchema);
