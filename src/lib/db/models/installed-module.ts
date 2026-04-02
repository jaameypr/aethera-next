import mongoose, { Schema, type Document, type Model } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IModuleEnvVar {
  key: string;
  value: string;
  secret: boolean;
}

export interface IModuleSidebarItem {
  label: string;
  icon: string;
  description?: string;
}

export interface IInstalledModule extends Document {
  _id: mongoose.Types.ObjectId;
  moduleId: string;
  name: string;
  version: string;
  type: "docker" | "code";
  exposure: "public" | "internal" | "none";
  status:
    | "installing"
    | "running"
    | "stopped"
    | "error"
    | "updating"
    | "uninstalling";
  manifest: Record<string, unknown>;
  config: IModuleEnvVar[];
  containerId?: string;
  containerName?: string;
  internalUrl?: string;
  /** Admin-configurable external URL for this module (e.g. https://files.example.com) */
  publicUrl?: string;
  assignedPort?: number;
  errorMessage?: string;
  sidebar: IModuleSidebarItem[];
  permissions: string[];
  installedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Sub-schemas                                                        */
/* ------------------------------------------------------------------ */

const ModuleEnvVarSchema = new Schema<IModuleEnvVar>(
  {
    key: { type: String, required: true },
    value: { type: String, default: "" },
    secret: { type: Boolean, default: false },
  },
  { _id: false },
);

const ModuleSidebarItemSchema = new Schema<IModuleSidebarItem>(
  {
    label: { type: String, required: true },
    icon: { type: String, required: true },
    description: { type: String },
  },
  { _id: false },
);

/* ------------------------------------------------------------------ */
/*  Main schema                                                        */
/* ------------------------------------------------------------------ */

const InstalledModuleSchema = new Schema<IInstalledModule>(
  {
    moduleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    version: { type: String, required: true },
    type: { type: String, enum: ["docker", "code"], required: true },
    exposure: {
      type: String,
      enum: ["public", "internal", "none"],
      default: "none",
    },
    status: {
      type: String,
      enum: [
        "installing",
        "running",
        "stopped",
        "error",
        "updating",
        "uninstalling",
      ],
      default: "installing",
    },
    manifest: { type: Schema.Types.Mixed, default: {} },
    config: [ModuleEnvVarSchema],
    containerId: { type: String },
    containerName: { type: String },
    internalUrl: { type: String },
    publicUrl: { type: String },
    assignedPort: { type: Number },
    errorMessage: { type: String },
    sidebar: [ModuleSidebarItemSchema],
    permissions: [{ type: String }],
    installedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

export const InstalledModuleModel: Model<IInstalledModule> =
  mongoose.models.InstalledModule ||
  mongoose.model<IInstalledModule>("InstalledModule", InstalledModuleSchema);
