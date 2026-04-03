import "server-only";

import { connectDB } from "@/lib/db/connection";
import { UserModel, type IUser } from "@/lib/db/models/user";
import {
  hashPassword,
  comparePassword,
  generateTempPassword,
} from "@/lib/auth/password";
import { sendMail, isMailConfigured } from "./mail.service";
import type { PermissionEntry } from "@/lib/api/types";

export async function listAllUsers(): Promise<IUser[]> {
  await connectDB();
  return UserModel.find().sort({ createdAt: -1 }).lean<IUser[]>();
}

export async function getUserById(id: string): Promise<IUser | null> {
  await connectDB();
  return UserModel.findById(id).lean<IUser>();
}

export async function getByUsernameOrEmail(
  identifier: string,
): Promise<IUser | null> {
  await connectDB();
  const lower = identifier.toLowerCase();
  return UserModel.findOne({
    $or: [{ username: lower }, { email: lower }],
  }).lean<IUser>();
}

export async function createUser(data: {
  username: string;
  email?: string;
  password?: string;
  enabled?: boolean;
  roles?: string[];
  permissions?: PermissionEntry[];
}): Promise<{ user: IUser; tempPassword?: string; emailSent?: boolean }> {
  await connectDB();

  let passwordHash: string;
  let tempPassword: string | undefined;
  let emailSent = false;

  if (data.password) {
    // Direct password provided (setup wizard / no-mail flow)
    passwordHash = await hashPassword(data.password);
  } else {
    // Generate temp password (invitation flow)
    tempPassword = generateTempPassword();
    passwordHash = await hashPassword(tempPassword);

    // Try to send email
    if (data.email && isMailConfigured()) {
      const result = await sendMail(
        data.email,
        `Welcome to ${process.env.NEXT_PUBLIC_APP_NAME || "Aethera"}`,
        `<p>Hello ${data.username},</p><p>Your temporary password is: <strong>${tempPassword}</strong></p><p>Please log in and change your password.</p>`,
      );
      emailSent = result.sent;
    }
  }

  const user = await UserModel.create({
    username: data.username.toLowerCase(),
    email: (data.email || `${data.username}@localhost`).toLowerCase(),
    passwordHash,
    enabled: data.enabled ?? true,
    roles: data.roles || [],
    permissions: data.permissions || [],
  });

  const userObj = user.toObject() as IUser;
  return { user: userObj, tempPassword, emailSent };
}

export async function updateUser(
  id: string,
  patch: {
    username?: string;
    email?: string;
    enabled?: boolean;
    roles?: string[];
    permissions?: PermissionEntry[];
  },
): Promise<IUser | null> {
  await connectDB();
  const update: Record<string, unknown> = {};
  if (patch.username !== undefined) update.username = patch.username.toLowerCase();
  if (patch.email !== undefined) update.email = patch.email.toLowerCase();
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.roles !== undefined) update.roles = patch.roles;
  if (patch.permissions !== undefined) update.permissions = patch.permissions;

  return UserModel.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean<IUser>();
}

export async function setEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await connectDB();
  await UserModel.findByIdAndUpdate(id, { enabled });
}

export async function deleteUser(id: string): Promise<void> {
  await connectDB();
  await UserModel.findByIdAndDelete(id);
}

export async function resetPassword(
  id: string,
): Promise<{ tempPassword: string; emailSent: boolean }> {
  await connectDB();
  const user = await UserModel.findById(id);
  if (!user) throw new Error("User not found");

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  user.passwordHash = passwordHash;
  await user.save();

  let emailSent = false;
  if (user.email && isMailConfigured()) {
    const result = await sendMail(
      user.email,
      `Password Reset - ${process.env.NEXT_PUBLIC_APP_NAME || "Aethera"}`,
      `<p>Hello ${user.username},</p><p>Your password has been reset. Your new temporary password is: <strong>${tempPassword}</strong></p><p>Please log in and change your password.</p>`,
    );
    emailSent = result.sent;
  }

  return { tempPassword, emailSent };
}

export async function changePassword(
  userId: string,
  data: { currentPassword: string; newPassword: string },
): Promise<void> {
  await connectDB();
  const user = await UserModel.findById(userId);
  if (!user) throw new Error("User not found");

  const valid = await comparePassword(data.currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect");

  user.passwordHash = await hashPassword(data.newPassword);
  await user.save();
}

export async function getUserCount(): Promise<number> {
  await connectDB();
  return UserModel.countDocuments();
}
