import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IDiscordVerification extends Document {
  _id: mongoose.Types.ObjectId;
  projectKey: string;
  code: string;
  expiresAt: Date;
  consumed: boolean;
  createdAt: Date;
}

const DiscordVerificationSchema = new Schema<IDiscordVerification>(
  {
    projectKey: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

DiscordVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DiscordVerificationModel: Model<IDiscordVerification> =
  mongoose.models.DiscordVerification ||
  mongoose.model<IDiscordVerification>(
    "DiscordVerification",
    DiscordVerificationSchema,
  );
