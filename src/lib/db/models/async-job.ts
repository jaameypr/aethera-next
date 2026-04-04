import mongoose, { Schema, type Document, type Model } from "mongoose";

export type AsyncJobType = "backup:create" | "backup:restore" | "backup:import";
export type AsyncJobStatus = "pending" | "running" | "done" | "error";

export interface IAsyncJob extends Document {
  _id: mongoose.Types.ObjectId;
  type: AsyncJobType;
  status: AsyncJobStatus;
  progress: number;
  message: string;
  /** Operation-specific metadata stored at dispatch time, used by the runner on completion. */
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AsyncJobSchema = new Schema<IAsyncJob>(
  {
    type: {
      type: String,
      enum: ["backup:create", "backup:restore", "backup:import"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "running", "done", "error"],
      default: "pending",
    },
    progress: { type: Number, default: 0 },
    message: { type: String, default: "" },
    payload: { type: Schema.Types.Mixed, required: true, default: {} },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true },
);

AsyncJobSchema.index({ status: 1, createdAt: -1 });

export const AsyncJobModel: Model<IAsyncJob> =
  mongoose.models.AsyncJob || mongoose.model<IAsyncJob>("AsyncJob", AsyncJobSchema);
