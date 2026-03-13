import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { IPermission } from "./user";

export interface IRole extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description: string;
  permissions: IPermission[];
  createdAt: Date;
  updatedAt: Date;
}

const PermissionSchema = new Schema<IPermission>(
  {
    name: { type: String, required: true },
    allow: { type: Boolean, required: true },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const RoleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: { type: String, default: "" },
    permissions: [PermissionSchema],
  },
  { timestamps: true },
);

export const RoleModel: Model<IRole> =
  mongoose.models.Role || mongoose.model<IRole>("Role", RoleSchema);
