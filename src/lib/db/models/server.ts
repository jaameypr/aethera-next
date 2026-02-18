import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IServerAccess {
  userId: mongoose.Types.ObjectId;
  permissions: string[];
}

export interface IServer extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  projectKey: string;
  identifier: string;
  runtime: "minecraft" | "hytale";
  image: string;
  tag: string;
  status: "stopped" | "starting" | "running" | "stopping" | "error";
  port: number;
  rconPort?: number;
  memory: number;
  javaArgs?: string;
  env: Record<string, string>;
  properties: Record<string, string>;
  version?: string;
  modLoader?: "vanilla" | "forge" | "fabric" | "paper" | "spigot" | "purpur";
  containerId?: string;
  containerStatus?: string;
  autoStart: boolean;
  access: IServerAccess[];
  createdAt: Date;
  updatedAt: Date;
}

const ServerAccessSchema = new Schema<IServerAccess>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    permissions: [{ type: String }],
  },
  { _id: false },
);

const ServerSchema = new Schema<IServer>(
  {
    name: { type: String, required: true, trim: true },
    projectKey: { type: String, required: true, index: true },
    identifier: { type: String, required: true, unique: true, trim: true, lowercase: true },
    runtime: { type: String, enum: ["minecraft", "hytale"], required: true },
    image: { type: String, required: true },
    tag: { type: String, required: true },
    status: {
      type: String,
      enum: ["stopped", "starting", "running", "stopping", "error"],
      default: "stopped",
    },
    port: { type: Number, required: true },
    rconPort: { type: Number },
    memory: { type: Number, required: true },
    javaArgs: { type: String },
    env: { type: Map, of: String, default: {} },
    properties: { type: Map, of: String, default: {} },
    version: { type: String },
    modLoader: {
      type: String,
      enum: ["vanilla", "forge", "fabric", "paper", "spigot", "purpur"],
    },
    containerId: { type: String },
    containerStatus: { type: String },
    autoStart: { type: Boolean, default: false },
    access: [ServerAccessSchema],
  },
  { timestamps: true },
);

export const ServerModel: Model<IServer> =
  mongoose.models.Server || mongoose.model<IServer>("Server", ServerSchema);
