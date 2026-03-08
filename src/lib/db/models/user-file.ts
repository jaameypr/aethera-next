import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IUserFile extends Document {
  _id: mongoose.Types.ObjectId;
  identifier: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  userId: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserFileSchema = new Schema<IUserFile>(
  {
    identifier: { type: String, required: true, unique: true },
    originalFilename: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL: MongoDB automatically removes documents after expiresAt
UserFileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserFileModel: Model<IUserFile> =
  mongoose.models.UserFile ||
  mongoose.model<IUserFile>("UserFile", UserFileSchema);
