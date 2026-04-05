import "server-only";

import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";

const DISCORD_MODULE_ID = "discord";

/**
 * Retrieves the internal URL and API key for the Discord module.
 * Returns null if the module is not installed or not running.
 */
async function getDiscordModuleConn(): Promise<{ url: string; apiKey: string } | null> {
  await connectDB();
  const mod = await InstalledModuleModel.findOne({
    moduleId: DISCORD_MODULE_ID,
    status: "running",
  }).lean();

  if (!mod || !mod.internalUrl) return null;

  const apiKey = mod.config.find((c) => c.key === "AETHERA_API_KEY")?.value ?? "";
  return { url: mod.internalUrl, apiKey };
}

export async function isDiscordModuleRunning(): Promise<boolean> {
  const conn = await getDiscordModuleConn();
  return conn !== null;
}

/**
 * Calls the Discord module API with the stored API key.
 * Returns the JSON response or throws on network/auth errors.
 */
async function discordModuleFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const conn = await getDiscordModuleConn();
  if (!conn) {
    throw new Error("Discord module is not installed or not running");
  }

  return fetch(`${conn.url}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(conn.apiKey ? { Authorization: `Bearer ${conn.apiKey}` } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
}

// ---------------------------------------------------------------------------
// Guild / channel helpers (proxied to Discord module)
// ---------------------------------------------------------------------------

export async function getDiscordGuilds() {
  const res = await discordModuleFetch("/api/guilds");
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

export async function getDiscordChannels(guildId: string) {
  const res = await discordModuleFetch(`/api/guilds/${guildId}/channels`);
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

export async function createDiscordInvite(guildId: string) {
  const res = await discordModuleFetch(`/api/guilds/${guildId}/invite`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

export async function getDiscordBotInviteUrl() {
  const res = await discordModuleFetch("/api/guilds/bot-invite");
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Per-server config
// ---------------------------------------------------------------------------

export async function getServerDiscordConfig(serverId: string) {
  const res = await discordModuleFetch(`/api/servers/${serverId}/config`);
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

export async function updateServerDiscordConfig(serverId: string, config: unknown) {
  const res = await discordModuleFetch(`/api/servers/${serverId}/config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

export async function deleteServerDiscordConfig(serverId: string) {
  const res = await discordModuleFetch(`/api/servers/${serverId}/config`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
}

export async function getPendingWhitelistRequests(serverId: string) {
  const res = await discordModuleFetch(`/api/servers/${serverId}/whitelist-requests`);
  if (!res.ok) throw new Error(`Discord module error: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// API key validation helper (for internal Aethera endpoints)
// ---------------------------------------------------------------------------

/**
 * Verifies that a given Bearer token matches the Discord module's API key.
 * Used to authenticate requests from the Discord module to Aethera's internal endpoints.
 */
export async function verifyDiscordModuleApiKey(token: string): Promise<boolean> {
  await connectDB();
  const mod = await InstalledModuleModel.findOne({ moduleId: DISCORD_MODULE_ID }).lean();
  if (!mod) return false;

  const storedKey = mod.config.find((c) => c.key === "AETHERA_API_KEY")?.value ?? "";

  // If no API key is configured, rely on Docker-network isolation (same model as backup callbacks)
  if (!storedKey) return true;

  return storedKey === token;
}
