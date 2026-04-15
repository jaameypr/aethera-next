import "server-only";

import crypto from "node:crypto";
import { connectDB } from "@/lib/db/connection";
import { ProjectModel, type IProject } from "@/lib/db/models/project";
import { UserModel } from "@/lib/db/models/user";
import { DiscordVerificationModel } from "@/lib/db/models/discord-verification";
import { badRequest, notFound } from "@/lib/api/errors";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// 1. Verification Flow
// ---------------------------------------------------------------------------

export async function generateVerificationCode(
  projectKey: string,
): Promise<{ code: string; expiresAt: Date }> {
  await connectDB();

  const project = await ProjectModel.findOne({ key: projectKey }).lean();
  if (!project) throw notFound("Project not found");

  // Invalidate any existing codes for this project
  await DiscordVerificationModel.updateMany(
    { projectKey, consumed: false },
    { consumed: true },
  );

  const code = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 char hex
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  await DiscordVerificationModel.create({ projectKey, code, expiresAt });

  return { code, expiresAt };
}

export async function consumeVerificationCode(
  code: string,
  guildId: string,
  guildName: string,
  guildIcon?: string,
): Promise<IProject> {
  await connectDB();

  const verification = await DiscordVerificationModel.findOne({
    code: code.toUpperCase(),
    consumed: false,
    expiresAt: { $gt: new Date() },
  });

  if (!verification) {
    throw badRequest("Invalid or expired verification code");
  }

  // Conflict: this guild is already linked to a different project
  const guildConflict = await ProjectModel.findOne({
    discordGuildId: guildId,
    key: { $ne: verification.projectKey },
  }).lean();
  if (guildConflict) {
    throw badRequest("This Discord server is already linked to another project");
  }

  verification.consumed = true;
  await verification.save();

  const project = await ProjectModel.findOneAndUpdate(
    { key: verification.projectKey },
    {
      discordGuildId: guildId,
      discordGuildName: guildName,
      discordGuildIcon: guildIcon ?? null,
    },
    { returnDocument: "after" },
  );

  if (!project) throw notFound("Project not found");

  return project;
}

export async function unlinkDiscord(projectKey: string): Promise<void> {
  await connectDB();

  await ProjectModel.updateOne(
    { key: projectKey },
    {
      $unset: {
        discordGuildId: "",
        discordGuildName: "",
        discordGuildIcon: "",
      },
    },
  );
}

// ---------------------------------------------------------------------------
// 2. Player Linking
// ---------------------------------------------------------------------------

export async function linkDiscordToUser(
  discordId: string,
  userId: string,
): Promise<void> {
  await connectDB();

  // Ensure no other user has this discordId
  const existing = await UserModel.findOne({ discordId }).lean();
  if (existing && String(existing._id) !== userId) {
    throw badRequest("Discord account is already linked to another user");
  }

  await UserModel.updateOne({ _id: userId }, { discordId });
}

export async function unlinkDiscordFromUser(userId: string): Promise<void> {
  await connectDB();
  await UserModel.updateOne({ _id: userId }, { $unset: { discordId: "" } });
}

export async function getUserByDiscordId(discordId: string) {
  await connectDB();
  return UserModel.findOne({ discordId }).lean();
}
