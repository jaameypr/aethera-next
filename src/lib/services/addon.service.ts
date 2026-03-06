import { readdir, stat, mkdir, rm, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { connectDB } from "@/lib/db/connection";
import { ServerModel, type IServer } from "@/lib/db/models/server";
import { getServerDataPath } from "@/lib/docker/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddonEntry {
  name: string;
  filename: string;
  size: number;
  modifiedAt: Date;
  enabled: boolean;
}

type AddonType = "mods" | "plugins" | "datapacks";

const ADDON_DIRS: Record<AddonType, string> = {
  mods: "mods",
  plugins: "plugins",
  datapacks: path.join("world", "datapacks"),
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function addonDir(server: IServer, type: AddonType): string {
  return path.join(getServerDataPath(server.identifier), ADDON_DIRS[type]);
}

function disabledDir(server: IServer, type: AddonType): string {
  return path.join(addonDir(server, type), ".disabled");
}

async function requireStopped(serverId: string): Promise<IServer> {
  await connectDB();
  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw new Error("Server must be stopped for this operation");
  }
  return server;
}

async function getServerDoc(serverId: string): Promise<IServer> {
  await connectDB();
  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  return server;
}

async function listEntries(dir: string, enabled: boolean): Promise<AddonEntry[]> {
  const entries: AddonEntry[] = [];
  let dirEntries;
  try {
    dirEntries = await readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  for (const entry of dirEntries) {
    if (entry.name === ".disabled" || entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    try {
      const s = await stat(fullPath);
      entries.push({
        name: entry.name.replace(/\.[^.]+$/, ""),
        filename: entry.name,
        size: entry.isDirectory() ? 0 : s.size,
        modifiedAt: s.mtime,
        enabled,
      });
    } catch {
      // entry may have been removed
    }
  }

  return entries;
}

async function listAddons(serverId: string, type: AddonType): Promise<AddonEntry[]> {
  const server = await getServerDoc(serverId);
  const active = await listEntries(addonDir(server, type), true);
  const disabled = await listEntries(disabledDir(server, type), false);
  return [...active, ...disabled].sort((a, b) => a.name.localeCompare(b.name));
}

async function uploadAddon(
  serverId: string,
  type: AddonType,
  file: File,
): Promise<AddonEntry> {
  const server = await requireStopped(serverId);
  const dir = addonDir(server, type);
  await mkdir(dir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const destPath = path.join(dir, file.name);
  await writeFile(destPath, buffer);

  const s = await stat(destPath);
  return {
    name: file.name.replace(/\.[^.]+$/, ""),
    filename: file.name,
    size: s.size,
    modifiedAt: s.mtime,
    enabled: true,
  };
}

async function deleteAddon(
  serverId: string,
  type: AddonType,
  filename: string,
): Promise<void> {
  const server = await requireStopped(serverId);
  const activePath = path.join(addonDir(server, type), filename);
  const disabledPath = path.join(disabledDir(server, type), filename);

  // Try both locations
  try {
    await rm(activePath, { recursive: true, force: true });
  } catch { /* ignore */ }
  try {
    await rm(disabledPath, { recursive: true, force: true });
  } catch { /* ignore */ }
}

async function setAddonEnabled(
  serverId: string,
  type: AddonType,
  filename: string,
  enabled: boolean,
): Promise<void> {
  const server = await requireStopped(serverId);
  const activeDir = addonDir(server, type);
  const disDir = disabledDir(server, type);

  const srcDir = enabled ? disDir : activeDir;
  const destDir = enabled ? activeDir : disDir;

  await mkdir(destDir, { recursive: true });
  const src = path.join(srcDir, filename);
  const dest = path.join(destDir, filename);

  await rename(src, dest);
}

// ---------------------------------------------------------------------------
// Mods
// ---------------------------------------------------------------------------

export async function listMods(serverId: string): Promise<AddonEntry[]> {
  return listAddons(serverId, "mods");
}

export async function uploadMod(serverId: string, file: File): Promise<AddonEntry> {
  return uploadAddon(serverId, "mods", file);
}

export async function deleteMod(serverId: string, filename: string): Promise<void> {
  return deleteAddon(serverId, "mods", filename);
}

export async function excludeMod(serverId: string, filename: string): Promise<void> {
  return setAddonEnabled(serverId, "mods", filename, false);
}

export async function includeMod(serverId: string, filename: string): Promise<void> {
  return setAddonEnabled(serverId, "mods", filename, true);
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export async function listPlugins(serverId: string): Promise<AddonEntry[]> {
  return listAddons(serverId, "plugins");
}

export async function uploadPlugin(serverId: string, file: File): Promise<AddonEntry> {
  return uploadAddon(serverId, "plugins", file);
}

export async function deletePlugin(serverId: string, filename: string): Promise<void> {
  return deleteAddon(serverId, "plugins", filename);
}

// ---------------------------------------------------------------------------
// Datapacks
// ---------------------------------------------------------------------------

export async function listDatapacks(serverId: string): Promise<AddonEntry[]> {
  return listAddons(serverId, "datapacks");
}

export async function uploadDatapack(serverId: string, file: File): Promise<AddonEntry> {
  return uploadAddon(serverId, "datapacks", file);
}

export async function deleteDatapack(serverId: string, filename: string): Promise<void> {
  return deleteAddon(serverId, "datapacks", filename);
}

export async function activateDatapack(serverId: string, filename: string): Promise<void> {
  return setAddonEnabled(serverId, "datapacks", filename, true);
}

export async function deactivateDatapack(serverId: string, filename: string): Promise<void> {
  return setAddonEnabled(serverId, "datapacks", filename, false);
}
