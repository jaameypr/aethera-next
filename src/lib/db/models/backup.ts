import mongoose, { Schema, type Document, type Model } from "mongoose";

export type BackupComponent = "world" | "config" | "mods" | "plugins" | "datapacks";

export interface IBackup extends Document {
  _id: mongoose.Types.ObjectId;
  serverId: mongoose.Types.ObjectId;
  name: string;
  filename: string;
  path: string;
  size: number;
  components: BackupComponent[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const BackupSchema = new Schema<IBackup>({
  serverId: { type: Schema.Types.ObjectId, ref: "Server", required: true },
  name: { type: String, required: true, trim: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  size: { type: Number, required: true },
  components: [{ type: String, enum: ["world", "config", "mods", "plugins", "datapacks"] }],
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
});

BackupSchema.index({ serverId: 1, createdAt: -1 });

export const BackupModel: Model<IBackup> =
  mongoose.models.Backup || mongoose.model<IBackup>("Backup", BackupSchema);
