import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { ServerType, PackSource } from "@/lib/config/server-types";

export interface IServerAccess {
  userId: mongoose.Types.ObjectId;
  permissions: string[];
}

export interface IPackReference {
  /** CurseForge: project slug (e.g. "all-the-mods-9") */
  slug?: string;
  /** CurseForge project ID or Modrinth project ID / slug */
  projectId?: string;
  /** CurseForge file ID */
  fileId?: string;
  /** Modrinth version ID */
  versionId?: string;
  /** Modrinth: direct .mrpack download URL (from uploaded file or version) */
  mrpackUrl?: string;
  /** Display name of the pack as resolved */
  packName?: string;
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
  /** Primary server type — replaces modLoader as the canonical field */
  serverType?: ServerType;
  /**
   * Legacy modLoader field — kept for backward compat with existing servers.
   * New code should use serverType.
   */
  modLoader?: "vanilla" | "forge" | "fabric" | "paper" | "spigot" | "purpur";
  /** Pack installation source (only for pack-driven types) */
  packSource?: PackSource;
  /** Structured pack reference for container env reconstruction */
  packReference?: IPackReference;
  /** MC version resolved from pack metadata */
  resolvedMinecraftVersion?: string;
  /** Loader type resolved from pack (e.g. "forge", "fabric") */
  resolvedLoader?: string;
  /** Loader version resolved from pack */
  resolvedLoaderVersion?: string;
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

const PackReferenceSchema = new Schema<IPackReference>(
  {
    slug: { type: String },
    projectId: { type: String },
    fileId: { type: String },
    versionId: { type: String },
    mrpackUrl: { type: String },
    packName: { type: String },
  },
  { _id: false },
);

const SERVER_TYPES = [
  "vanilla", "paper", "spigot", "purpur",
  "forge", "fabric", "curseforge", "modrinth", "hytale",
] as const;

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
    serverType: { type: String, enum: SERVER_TYPES },
    modLoader: {
      type: String,
      enum: ["vanilla", "forge", "fabric", "paper", "spigot", "purpur"],
    },
    packSource: { type: String, enum: ["curseforge", "modrinth"] },
    packReference: { type: PackReferenceSchema },
    resolvedMinecraftVersion: { type: String },
    resolvedLoader: { type: String },
    resolvedLoaderVersion: { type: String },
    containerId: { type: String },
    containerStatus: { type: String },
    autoStart: { type: Boolean, default: false },
    access: [ServerAccessSchema],
  },
  { timestamps: true },
);

export const ServerModel: Model<IServer> =
  mongoose.models.Server || mongoose.model<IServer>("Server", ServerSchema);
