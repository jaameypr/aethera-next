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
  /** Panel-local upload ID — used during server creation to copy the file into /data */
  mrpackUploadId?: string;
  /** Display name of the pack as resolved */
  packName?: string;
}

/** A panel-managed mod added on top of the pack's preinstalled mods */
export interface IAdditionalMod {
  _id?: mongoose.Types.ObjectId;
  /** Where to download this mod from */
  source: "modrinth" | "curseforge";
  /** Project ID (Modrinth project ID or CurseForge project ID) */
  projectId: string;
  /** Human-readable slug (for display / CF_EXCLUDE lookup) */
  slug?: string;
  /** Display name shown in UI */
  displayName: string;
  /** Modrinth: pin to this version ID */
  versionId?: string;
  /** CurseForge: pin to this file ID */
  fileId?: string;
  addedAt: Date;
}

/**
 * A preinstalled pack mod that should be suppressed on every container start.
 * Never a one-off filesystem mutation — stored declaratively and re-applied on start.
 */
export interface IExcludedPackMod {
  _id?: mongoose.Types.ObjectId;
  /** Display name shown in UI */
  displayName: string;
  /** Project slug (for display) */
  slug?: string;
  /** Project ID (for display / CF_EXCLUDE_MODS) */
  projectId?: string;
  /**
   * CurseForge: value passed to CF_EXCLUDE_MODS (slug or project ID).
   * Example: "jei" or "238222"
   */
  cfExcludeToken?: string;
  /**
   * Modrinth: partial filename token passed to MODRINTH_EXCLUDE_FILES.
   * Example: "jei-" or "jei-1.20.1"
   */
  filenameToken?: string;
  /**
   * If true, this exclusion targets override files rather than pack files.
   * Rendered into CF_OVERRIDES_EXCLUSIONS / MODRINTH_OVERRIDES_EXCLUSIONS.
   */
  isOverride?: boolean;
  excludedAt: Date;
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
  /** Panel-added mods rendered as MODRINTH_PROJECTS / CURSEFORGE_FILES on start */
  additionalMods?: IAdditionalMod[];
  /** Pack mods suppressed via CF_EXCLUDE_MODS / MODRINTH_EXCLUDE_FILES on start */
  excludedPackMods?: IExcludedPackMod[];
  /**
   * Java version override for the itzg image (e.g. "8", "11", "17", "21").
   * Auto-detected from the resolved MC version; can be overridden manually.
   */
  javaVersion?: string;
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
    mrpackUploadId: { type: String },
    packName: { type: String },
  },
  { _id: false },
);

const AdditionalModSchema = new Schema<IAdditionalMod>(
  {
    source: { type: String, enum: ["modrinth", "curseforge"], required: true },
    projectId: { type: String, required: true },
    slug: { type: String },
    displayName: { type: String, required: true },
    versionId: { type: String },
    fileId: { type: String },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const ExcludedPackModSchema = new Schema<IExcludedPackMod>(
  {
    displayName: { type: String, required: true },
    slug: { type: String },
    projectId: { type: String },
    cfExcludeToken: { type: String },
    filenameToken: { type: String },
    isOverride: { type: Boolean, default: false },
    excludedAt: { type: Date, default: Date.now },
  },
  { _id: true },
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
    additionalMods: { type: [AdditionalModSchema], default: [] },
    excludedPackMods: { type: [ExcludedPackModSchema], default: [] },
    javaVersion: { type: String },
    containerId: { type: String },
    containerStatus: { type: String },
    autoStart: { type: Boolean, default: false },
    access: [ServerAccessSchema],
  },
  { timestamps: true },
);

export const ServerModel: Model<IServer> =
  mongoose.models.Server || mongoose.model<IServer>("Server", ServerSchema);
