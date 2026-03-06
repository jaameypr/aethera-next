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

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_API = "https://discord.com/api/v10";
const VERIFICATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function requireToken(): string {
  if (!DISCORD_BOT_TOKEN) {
    throw badRequest("Discord integration is not configured");
  }
  return DISCORD_BOT_TOKEN;
}

async function discordFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = requireToken();
  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

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

  verification.consumed = true;
  await verification.save();

  const project = await ProjectModel.findOneAndUpdate(
    { key: verification.projectKey },
    {
      discordGuildId: guildId,
      discordGuildName: guildName,
      discordGuildIcon: guildIcon ?? null,
    },
    { new: true },
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

// ---------------------------------------------------------------------------
// 3. Notifications
// ---------------------------------------------------------------------------

export async function notifyServerEvent(
  projectKey: string,
  event: string,
  details: string,
): Promise<void> {
  await connectDB();

  const project = await ProjectModel.findOne({ key: projectKey })
    .select("discordGuildId name")
    .lean<IProject>();

  if (!project?.discordGuildId) return; // no linked guild

  const channelId = await findNotificationChannel(project.discordGuildId);
  if (!channelId) return;

  const colorMap: Record<string, number> = {
    SERVER_STARTED: 0x22c55e,  // green
    SERVER_STOPPED: 0xef4444,  // red
    BACKUP_CREATED: 0x3b82f6,  // blue
    SERVER_ERROR: 0xf59e0b,    // amber
  };

  await discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: [
        {
          title: `🎮 ${event.replace(/_/g, " ")}`,
          description: details,
          color: colorMap[event] ?? 0x6366f1,
          footer: { text: `Projekt: ${project.name}` },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });
}

async function findNotificationChannel(
  guildId: string,
): Promise<string | null> {
  try {
    const res = await discordFetch(`/guilds/${guildId}/channels`);
    if (!res.ok) return null;

    const channels = (await res.json()) as {
      id: string;
      name: string;
      type: number;
    }[];

    // Prefer a channel named "aethera" or "server-status", fall back to first text channel
    const preferred = channels.find(
      (c) =>
        c.type === 0 &&
        (c.name === "aethera" || c.name === "server-status"),
    );
    if (preferred) return preferred.id;

    const firstText = channels.find((c) => c.type === 0);
    return firstText?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

export function isDiscordConfigured(): boolean {
  return !!DISCORD_BOT_TOKEN;
}

export async function getGuildInfo(
  guildId: string,
): Promise<{ id: string; name: string; icon: string | null } | null> {
  try {
    const res = await discordFetch(`/guilds/${guildId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { id: data.id, name: data.name, icon: data.icon };
  } catch {
    return null;
  }
}
