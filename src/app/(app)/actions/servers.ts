"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import {
  startServer,
  stopServer,
  recreateServer,
  deleteServer,
  updateServer,
  createServer,
  getServer,
  fetchLogs,
  sendConsoleCommand,
  isPortAvailable,
  type LogEntry,
  type ServerCreateInput,
} from "@/lib/services/server.service";
import {
  listBlueprints,
  createBlueprint,
  deleteBlueprint,
  updateBlueprint,
  initializeBlueprint,
  type IBlueprint,
} from "@/lib/services/blueprint.service";
import { assertServerPermission } from "@/lib/services/server-access";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function revalidateServer(serverId: string, projectKey?: string) {
  revalidatePath(`/servers/${serverId}`);
  if (projectKey) {
    revalidatePath(`/projects/${projectKey}`);
    revalidatePath(`/projects/${projectKey}/servers`);
  }
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createServerAction(data: {
  projectKey: string;
  input: ServerCreateInput;
  autoStartNow?: boolean;
}): Promise<{ serverId: string }> {
  const session = await requireSession();

  try {
    const server = await createServer(data.projectKey, data.input, session.userId);
    const serverId = String(server._id);

    if (data.autoStartNow) {
      try {
        await startServer(serverId, session.userId);
      } catch {
        // server created but start failed — non-fatal
      }
    }

    revalidateServer(serverId, data.projectKey);
    return { serverId };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to create server",
    );
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startServerAction(data: {
  serverId: string;
}): Promise<{ containerId: string }> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.start");

    const result = await startServer(data.serverId, session.userId);
    revalidateServer(data.serverId, server.projectKey);
    return result;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to start server",
    );
  }
}

export async function stopServerAction(data: {
  serverId: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.stop");
    await stopServer(data.serverId, session.userId);
    revalidateServer(data.serverId, server?.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to stop server",
    );
  }
}

export async function recreateServerAction(data: {
  serverId: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.start");
    await recreateServer(data.serverId, session.userId);
    revalidateServer(data.serverId, server?.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to recreate server",
    );
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function deleteServerAction(data: {
  serverId: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");
    await deleteServer(data.serverId, session.userId);
    revalidateServer(data.serverId, server.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to delete server",
    );
  }
}

export async function updateServerAction(data: {
  serverId: string;
  patch: Record<string, unknown>;
}): Promise<void> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");
    const updated = await updateServer(data.serverId, data.patch);
    revalidateServer(data.serverId, updated.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to update server",
    );
  }
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export async function writePropertiesAction(data: {
  serverId: string;
  properties: Record<string, string>;
}): Promise<void> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");
    const updated = await updateServer(data.serverId, {
      properties: data.properties,
    });
    revalidateServer(data.serverId, updated.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to write properties",
    );
  }
}

export async function readPropertiesAction(data: {
  serverId: string;
}): Promise<Record<string, string>> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");
    return server.properties ?? {};
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to read properties",
    );
  }
}

// ---------------------------------------------------------------------------
// Console & Logs
// ---------------------------------------------------------------------------

export async function sendConsoleCommandAction(data: {
  serverId: string;
  command: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    const server = await getServer(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.console");
    await sendConsoleCommand(data.serverId, data.command);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to send command",
    );
  }
}

export async function fetchLogsAction(data: {
  serverId: string;
  lines?: number;
}): Promise<LogEntry[]> {
  await requireSession();

  try {
    return await fetchLogs(data.serverId, data.lines);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to fetch logs",
    );
  }
}

// ---------------------------------------------------------------------------
// Server Access Management
// ---------------------------------------------------------------------------

export async function grantServerAccessAction(data: {
  serverId: string;
  userId: string;
  permissions: string[];
}): Promise<void> {
  const session = await requireSession();
  await connectDB();

  try {
    const server = await ServerModel.findById(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const existing = server.access.some(
      (a) => a.userId.toString() === data.userId,
    );
    if (existing) throw new Error("User already has access to this server");

    await ServerModel.updateOne(
      { _id: data.serverId },
      {
        $push: {
          access: { userId: data.userId, permissions: data.permissions },
        },
      },
    );

    revalidateServer(data.serverId, server.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to grant access",
    );
  }
}

export async function removeServerMemberAction(data: {
  serverId: string;
  userId: string;
}): Promise<void> {
  const session = await requireSession();
  await connectDB();

  try {
    const server = await ServerModel.findById(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    await ServerModel.updateOne(
      { _id: data.serverId },
      { $pull: { access: { userId: data.userId } } },
    );

    revalidateServer(data.serverId, server.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to remove member",
    );
  }
}

export async function updateServerAccessAction(data: {
  serverId: string;
  userId: string;
  permissions: string[];
}): Promise<void> {
  const session = await requireSession();
  await connectDB();

  try {
    const server = await ServerModel.findById(data.serverId);
    if (!server) throw new Error("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const result = await ServerModel.updateOne(
      { _id: data.serverId, "access.userId": data.userId },
      { $set: { "access.$.permissions": data.permissions } },
    );

    if (result.matchedCount === 0) {
      throw new Error("Server or access entry not found");
    }

    revalidateServer(data.serverId, server.projectKey);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to update access",
    );
  }
}

// ---------------------------------------------------------------------------
// Pack Resolution
// ---------------------------------------------------------------------------

import type { IPackReference } from "@/lib/db/models/server";
import type { PackSource } from "@/lib/config/server-types";
import type { ResolvedPackInfo } from "@/lib/services/pack-resolution.service";

export async function resolvePackAction(data: {
  source: PackSource;
  reference: IPackReference;
  /** Base64-encoded .mrpack file contents (for Modrinth local upload) */
  mrpackBase64?: string;
}): Promise<{ ok: true; data: ResolvedPackInfo } | { ok: false; error: string }> {
  await requireSession();

  try {
    const { resolveModrinthPack, resolveCurseForgePack, parseMrpack } =
      await import("@/lib/services/pack-resolution.service");

    if (data.source === "modrinth") {
      if (data.mrpackBase64) {
        const buf = Buffer.from(data.mrpackBase64, "base64");
        return { ok: true, data: await parseMrpack(buf) };
      }
      return { ok: true, data: await resolveModrinthPack(data.reference) };
    }

    if (data.source === "curseforge") {
      return { ok: true, data: await resolveCurseForgePack(data.reference) };
    }

    return { ok: false, error: `Unbekannte Pack-Quelle: ${data.source}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler beim Auflösen des Packs" };
  }
}

// ---------------------------------------------------------------------------
// Pack Mod Lookup
// ---------------------------------------------------------------------------

export interface PackModInfo {
  projectId: string;
  slug: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
}

/**
 * Look up a mod by project ID or slug from Modrinth or CurseForge.
 * Returns structured metadata safe to store in additionalMods.
 */
export async function lookupPackModAction(data: {
  source: "modrinth" | "curseforge";
  query: string; // projectId or slug
}): Promise<{ ok: true; data: PackModInfo } | { ok: false; error: string }> {
  await requireSession();

  try {
    if (data.source === "modrinth") {
      const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(data.query)}`, {
        headers: { "User-Agent": "aethera-panel/1.0" },
        next: { revalidate: 60 },
      });
      if (res.status === 404) return { ok: false, error: `Modrinth-Projekt nicht gefunden: ${data.query}` };
      if (!res.ok) return { ok: false, error: `Modrinth API Fehler: ${res.status}` };
      const project = await res.json();
      if (project.project_type !== "mod") {
        return { ok: false, error: `"${project.title}" ist kein Mod (Typ: ${project.project_type})` };
      }
      return {
        ok: true,
        data: {
          projectId: project.id,
          slug: project.slug,
          displayName: project.title,
          description: project.description,
          iconUrl: project.icon_url,
        },
      };
    }

    if (data.source === "curseforge") {
      const key = process.env.CURSEFORGE_API_KEY;
      if (!key) return { ok: false, error: "CURSEFORGE_API_KEY ist nicht konfiguriert" };

      // Try numeric project ID first, then slug search
      const isNumeric = /^\d+$/.test(data.query);
      let mod: { id: number; slug: string; name: string; summary: string; logo?: { thumbnailUrl: string } } | null = null;

      if (isNumeric) {
        const res = await fetch(`https://api.curseforge.com/v1/mods/${data.query}`, {
          headers: { "x-api-key": key },
        });
        if (res.ok) {
          const body = await res.json();
          mod = body.data;
        }
      }

      if (!mod) {
        const res = await fetch(
          `https://api.curseforge.com/v1/search?gameId=432&classId=6&searchFilter=${encodeURIComponent(data.query)}&pageSize=1`,
          { headers: { "x-api-key": key } },
        );
        if (!res.ok) return { ok: false, error: `CurseForge API Fehler: ${res.status}` };
        const body = await res.json();
        if (!body.data?.length) return { ok: false, error: `CurseForge-Mod nicht gefunden: ${data.query}` };
        mod = body.data[0];
      }

      if (!mod) return { ok: false, error: `CurseForge-Mod nicht gefunden: ${data.query}` };

      return {
        ok: true,
        data: {
          projectId: String(mod.id),
          slug: mod.slug,
          displayName: mod.name,
          description: mod.summary,
          iconUrl: mod.logo?.thumbnailUrl,
        },
      };
    }

    return { ok: false, error: "Unbekannte Quelle" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" };
  }
}

// ---------------------------------------------------------------------------
// System Info
// ---------------------------------------------------------------------------

export async function checkPortAction(data: {
  port: number;
}): Promise<boolean> {
  await requireSession();

  try {
    return await isPortAvailable(data.port);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to check port",
    );
  }
}

// ---------------------------------------------------------------------------
// Blueprint Actions
// ---------------------------------------------------------------------------

export async function listBlueprintsAction(data: {
  projectKey: string;
}): Promise<IBlueprint[]> {
  const session = await requireSession();
  return listBlueprints(data.projectKey, session.userId);
}

export async function createBlueprintAction(data: {
  projectKey: string;
  name: string;
  maxRam: number;
}): Promise<IBlueprint> {
  const session = await requireSession();

  try {
    const blueprint = await createBlueprint(
      data.projectKey,
      { name: data.name, maxRam: data.maxRam },
      session.userId,
    );
    revalidatePath(`/projects/${data.projectKey}`);
    return blueprint;
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to create blueprint",
    );
  }
}

export async function deleteBlueprintAction(data: {
  blueprintId: string;
  projectKey: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    await deleteBlueprint(data.blueprintId, session.userId);
    revalidatePath(`/projects/${data.projectKey}`);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to delete blueprint",
    );
  }
}

export async function updateBlueprintAction(data: {
  blueprintId: string;
  projectKey: string;
  name?: string;
  maxRam?: number;
}): Promise<void> {
  const session = await requireSession();

  try {
    await updateBlueprint(
      data.blueprintId,
      { name: data.name, maxRam: data.maxRam },
      session.userId,
    );
    revalidatePath(`/projects/${data.projectKey}`);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to update blueprint",
    );
  }
}

export async function initializeBlueprintAction(data: {
  blueprintId: string;
  projectKey: string;
  input: ServerCreateInput;
  autoStartNow?: boolean;
}): Promise<{ serverId: string }> {
  const session = await requireSession();

  try {
    const { serverId } = await initializeBlueprint(
      data.blueprintId,
      data.input,
      session.userId,
    );

    if (data.autoStartNow) {
      try {
        await startServer(serverId, session.userId);
      } catch {
        // non-fatal
      }
    }

    revalidateServer(serverId, data.projectKey);
    revalidatePath(`/projects/${data.projectKey}`);
    return { serverId };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to initialize blueprint",
    );
  }
}
