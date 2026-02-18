import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IMember {
  userId: mongoose.Types.ObjectId;
  role: "admin" | "member";
}

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  key: string;
  description?: string;
  owner: mongoose.Types.ObjectId;
  members: IMember[];
  discordGuildId?: string;
  discordGuildName?: string;
  discordGuildIcon?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MemberSchema = new Schema<IMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { _id: false },
);

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [MemberSchema],
    discordGuildId: { type: String },
    discordGuildName: { type: String },
    discordGuildIcon: { type: String },
  },
  { timestamps: true },
);

export const ProjectModel: Model<IProject> =
  mongoose.models.Project || mongoose.model<IProject>("Project", ProjectSchema);
