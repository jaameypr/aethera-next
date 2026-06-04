import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IActivityRead extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  projectKey: string;
  lastSeenAt: Date;
}

const ActivityReadSchema = new Schema<IActivityRead>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  projectKey: { type: String, required: true },
  lastSeenAt: { type: Date, required: true, default: Date.now },
});

ActivityReadSchema.index({ userId: 1, projectKey: 1 }, { unique: true });

export const ActivityReadModel: Model<IActivityRead> =
  mongoose.models.ActivityRead ||
  mongoose.model<IActivityRead>("ActivityRead", ActivityReadSchema);
