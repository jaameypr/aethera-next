import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IBlueprint extends Document {
  _id: mongoose.Types.ObjectId;
  projectKey: string;
  name: string;
  maxRam: number; // MB
  status: "available" | "claimed";
  serverId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BlueprintSchema = new Schema<IBlueprint>(
  {
    projectKey: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    maxRam: { type: Number, required: true, min: 512 },
    status: {
      type: String,
      enum: ["available", "claimed"],
      default: "available",
    },
    serverId: { type: Schema.Types.ObjectId, ref: "Server" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export const BlueprintModel: Model<IBlueprint> =
  mongoose.models.Blueprint ||
  mongoose.model<IBlueprint>("Blueprint", BlueprintSchema);
