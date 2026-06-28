import "server-only";

import { getServer, sendConsoleCommand } from "@/lib/services/server.service";
import { readFile, writeFile } from "@/lib/services/file.service";
import { resolveProfile, offlineUuid } from "@/lib/services/mojang.service";
import { badRequest, notFound } from "@/lib/api/errors";

/**
 * Whitelist + ops (operators) manager.
 *
 * Race rule (see also the file/console services):
 * - Server RUNNING → mutate via `sendConsoleCommand` only; Minecraft owns and
 *   rewrites whitelist.json / ops.json. Never write those files while running.
 * - Server STOPPED → edit whitelist.json / ops.json directly; applied on start.
 */

const WHITELIST_FILE = "whitelist.json";
const OPS_FILE = "ops.json";
const PROPERTIES_FILE = "server.properties";

const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/;

export interface WhitelistEntry {
  uuid: string;
  name: string;
}

export interface OpsEntry {
  uuid: string;
  name: string;
  level: number;
  bypassesPlayerLimit?: boolean;
}

export interface PlayersList {
  running: boolean;
  whitelist: WhitelistEntry[];
  ops: { uuid: string; name: string; level: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertValidUsername(name: string): void {
  if (typeof name !== "string" || !USERNAME_RE.test(name)) {
    throw badRequest(
      "Invalid Minecraft username (allowed: 1-16 chars of A-Z, a-z, 0-9, _)",
    );
  }
}

async function requireServer(serverId: string) {
  const server = await getServer(serverId);
  if (!server) throw notFound("Server not found");
  return server;
}

function isRunning(status: string): boolean {
  return status === "running";
}

/** Read + JSON-parse a server file; missing file or parse error → []. */
async function readJsonArray<T>(serverId: string, file: string): Promise<T[]> {
  let content: string;
  try {
    ({ content } = await readFile(serverId, file));
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function writeJson(
  serverId: string,
  file: string,
  data: unknown,
): Promise<void> {
  await writeFile(serverId, file, JSON.stringify(data, null, 2));
}

/** Resolve a name to a profile, falling back to the deterministic offline uuid. */
async function resolveOrOffline(name: string): Promise<WhitelistEntry> {
  const profile = await resolveProfile(name).catch(() => null);
  if (profile) return { uuid: profile.uuid, name: profile.name };
  return { uuid: offlineUuid(name), name };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listPlayers(serverId: string): Promise<PlayersList> {
  const server = await requireServer(serverId);

  const [whitelist, ops] = await Promise.all([
    readJsonArray<WhitelistEntry>(serverId, WHITELIST_FILE),
    readJsonArray<OpsEntry>(serverId, OPS_FILE),
  ]);

  return {
    running: isRunning(server.status),
    whitelist: whitelist.map((w) => ({ uuid: w.uuid, name: w.name })),
    ops: ops.map((o) => ({
      uuid: o.uuid,
      name: o.name,
      level: o.level ?? 4,
    })),
  };
}

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------

export async function addWhitelist(
  serverId: string,
  name: string,
): Promise<void> {
  assertValidUsername(name);
  const server = await requireServer(serverId);

  if (isRunning(server.status)) {
    await sendConsoleCommand(serverId, `whitelist add ${name}`);
    return;
  }

  const entry = await resolveOrOffline(name);
  const list = await readJsonArray<WhitelistEntry>(serverId, WHITELIST_FILE);
  const without = list.filter(
    (e) => e.name?.toLowerCase() !== name.toLowerCase(),
  );
  without.push(entry);
  await writeJson(serverId, WHITELIST_FILE, without);
}

export async function removeWhitelist(
  serverId: string,
  name: string,
): Promise<void> {
  assertValidUsername(name);
  const server = await requireServer(serverId);

  if (isRunning(server.status)) {
    await sendConsoleCommand(serverId, `whitelist remove ${name}`);
    return;
  }

  const list = await readJsonArray<WhitelistEntry>(serverId, WHITELIST_FILE);
  const filtered = list.filter(
    (e) => e.name?.toLowerCase() !== name.toLowerCase(),
  );
  await writeJson(serverId, WHITELIST_FILE, filtered);
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

export async function addOp(
  serverId: string,
  name: string,
  level = 4,
): Promise<void> {
  assertValidUsername(name);
  const server = await requireServer(serverId);

  if (isRunning(server.status)) {
    // Vanilla `op` applies the server's default op level live. A custom level
    // cannot be set live via vanilla — it would require a restart to read the
    // updated ops.json. Keep it simple: just issue the command when running.
    await sendConsoleCommand(serverId, `op ${name}`);
    return;
  }

  const entry = await resolveOrOffline(name);
  const list = await readJsonArray<OpsEntry>(serverId, OPS_FILE);
  const without = list.filter(
    (e) => e.name?.toLowerCase() !== name.toLowerCase(),
  );
  without.push({
    uuid: entry.uuid,
    name: entry.name,
    level,
    bypassesPlayerLimit: false,
  });
  await writeJson(serverId, OPS_FILE, without);
}

export async function removeOp(serverId: string, name: string): Promise<void> {
  assertValidUsername(name);
  const server = await requireServer(serverId);

  if (isRunning(server.status)) {
    await sendConsoleCommand(serverId, `deop ${name}`);
    return;
  }

  const list = await readJsonArray<OpsEntry>(serverId, OPS_FILE);
  const filtered = list.filter(
    (e) => e.name?.toLowerCase() !== name.toLowerCase(),
  );
  await writeJson(serverId, OPS_FILE, filtered);
}

/**
 * Update the level of an existing operator entry in ops.json.
 *
 * Vanilla has no command to set a per-player op level live, so this always
 * edits the file directly regardless of server state. The UI surfaces the
 * "restart to apply" note when the server is running.
 */
export async function setOpLevel(
  serverId: string,
  name: string,
  level: number,
): Promise<void> {
  assertValidUsername(name);

  if (!Number.isInteger(level) || level < 1 || level > 4) {
    throw badRequest("level must be an integer between 1 and 4");
  }

  await requireServer(serverId);

  const list = await readJsonArray<OpsEntry>(serverId, OPS_FILE);
  const index = list.findIndex(
    (e) => e.name?.toLowerCase() === name.toLowerCase(),
  );
  if (index === -1) {
    throw badRequest("Player is not an operator");
  }

  const updated = list.map((e, i) =>
    i === index ? { ...e, level } : e,
  );
  await writeJson(serverId, OPS_FILE, updated);
}

// ---------------------------------------------------------------------------
// Whitelist enabled flag (white-list in server.properties)
// ---------------------------------------------------------------------------

export async function setWhitelistEnabled(
  serverId: string,
  enabled: boolean,
): Promise<void> {
  const server = await requireServer(serverId);

  if (isRunning(server.status)) {
    await sendConsoleCommand(serverId, enabled ? "whitelist on" : "whitelist off");
    return;
  }

  let content = "";
  try {
    ({ content } = await readFile(serverId, PROPERTIES_FILE));
  } catch {
    content = "";
  }

  const line = `white-list=${enabled ? "true" : "false"}`;
  if (/^white-list=.*$/m.test(content)) {
    content = content.replace(/^white-list=.*$/m, line);
  } else {
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += line + "\n";
  }

  await writeFile(serverId, PROPERTIES_FILE, content);
}

export async function isWhitelistEnabled(serverId: string): Promise<boolean> {
  await requireServer(serverId);

  let content: string;
  try {
    ({ content } = await readFile(serverId, PROPERTIES_FILE));
  } catch {
    return false;
  }

  const match = content.match(/^white-list=(true|false)\s*$/m);
  return match ? match[1] === "true" : false;
}
