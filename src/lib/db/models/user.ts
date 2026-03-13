import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IPermission {
  name: string;
  allow: boolean;
  value?: string | number;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  username: string;
  email: string;
  passwordHash: string;
  enabled: boolean;
  roles: string[];
  permissions: IPermission[];
  discordId?: string;
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

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    roles: [{ type: String }],
    permissions: [PermissionSchema],
    discordId: { type: String, sparse: true },
  },
  { timestamps: true },
);

export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
