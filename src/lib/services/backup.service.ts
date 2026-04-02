import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import tar from "tar-stream";
import { connectDB } from "@/lib/db/connection";
import { BackupModel, type IBackup, type BackupComponent } from "@/lib/db/models/backup";
import { ServerModel, type IServer } from "@/lib/db/models/server";
import { logAction } from "@/lib/services/project.service";
import { getBackupDir, getServerDataPath } from "@/lib/docker/storage";

// ---------------------------------------------------------------------------
// Component → directory mapping (relative to server data dir)
// ---------------------------------------------------------------------------

const COMPONENT_DIRS: Record<BackupComponent, string[]> = {
  world: ["world", "world_nether", "world_the_end"],
  config: ["server.properties", "bukkit.yml", "spigot.yml", "paper.yml", "config"],
  mods: ["mods"],
  plugins: ["plugins"],
  datapacks: ["world/datapacks"],
};

export interface BackupComponents {
  components: Record<BackupComponent, string[]>;
  totalFiles: number;
  totalSize: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function backupDir(serverId: string): string {
  return path.resolve(getBackupDir(), serverId);
}

function backupFilename(name: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${ts}-${safeName}.tar.gz`;
}

async function addDirectoryToTar(
  pack: tar.Pack,
  dirPath: string,
  prefix: string,
): Promise<number> {
  let totalSize = 0;
  let entries;

  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const archivePath = path.join(prefix, entry.name);

    if (entry.isDirectory()) {
      totalSize += await addDirectoryToTar(pack, fullPath, archivePath);
    } else {
      try {
        const s = await stat(fullPath);
        totalSize += s.size;
        await new Promise<void>((resolve, reject) => {
          const entryStream = pack.entry(
            { name: archivePath, size: s.size, mtime: s.mtime },
            (err) => (err ? reject(err) : resolve()),
          );
          createReadStream(fullPath).pipe(entryStream);
        });
      } catch {
        // file may have been removed
      }
    }
  }

  return totalSize;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createBackup(
  serverId: string,
  components: BackupComponent[],
  actorId: string,
): Promise<IBackup> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw new Error("Server must be stopped to create a backup");
  }

  const serverDir = getServerDataPath(server.identifier);
  const destDir = backupDir(serverId);
  await mkdir(destDir, { recursive: true });

  const filename = backupFilename(server.name);
  const filePath = path.join(destDir, filename);

  // Build tar.gz
  const pack = tar.pack();
  let totalSize = 0;

  for (const component of components) {
    const dirs = COMPONENT_DIRS[component] ?? [];
    for (const rel of dirs) {
      const absPath = path.join(serverDir, rel);
      totalSize += await addDirectoryToTar(pack, absPath, rel);
    }
  }

  pack.finalize();

  await pipeline(pack, createGzip(), createWriteStream(filePath));

  const archiveStat = await stat(filePath);

  const backup = await BackupModel.create({
    serverId: server._id,
    name: server.name,
    filename,
    path: filePath,
    size: archiveStat.size,
    components,
    status: "completed",
    strategy: "sync",
    createdBy: actorId,
  });

  await logAction(server.projectKey, "BACKUP_CREATED", actorId, {
    backupId: backup._id.toString(),
    serverId,
    components,
  });

  return backup.toObject() as IBackup;
}

export async function listBackups(serverId: string): Promise<IBackup[]> {
  await connectDB();
  return BackupModel.find({ serverId })
    .sort({ createdAt: -1 })
    .lean<IBackup[]>();
}

export async function deleteBackup(backupId: string): Promise<void> {
  await connectDB();

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");

  try {
    await rm(backup.path, { force: true });
  } catch {
    // file may already be gone
  }

  const server = await ServerModel.findById(backup.serverId);

  await BackupModel.findByIdAndDelete(backupId);

  if (server) {
    await logAction(server.projectKey, "BACKUP_DELETED", backup.createdBy.toString(), {
      backupId,
      filename: backup.filename,
    });
  }
}

export async function restoreBackup(
  backupId: string,
  serverId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw new Error("Server must be stopped to restore a backup");
  }

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");

  const serverDir = getServerDataPath(server.identifier);

  // Extract tar.gz into server data dir
  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();

    extract.on("entry", (header, stream, next) => {
      const destPath = path.resolve(serverDir, header.name);

      // Prevent path traversal
      if (!destPath.startsWith(serverDir)) {
        stream.resume();
        next();
        return;
      }

      if (header.type === "directory") {
        mkdir(destPath, { recursive: true }).then(() => {
          stream.resume();
          next();
        }, reject);
      } else {
        const dir = path.dirname(destPath);
        mkdir(dir, { recursive: true }).then(() => {
          const ws = createWriteStream(destPath);
          stream.pipe(ws);
          ws.on("finish", next);
          ws.on("error", reject);
        }, reject);
      }
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    createReadStream(backup.path).pipe(createGunzip()).pipe(extract);
  });

  await logAction(server.projectKey, "BACKUP_RESTORED", backup.createdBy.toString(), {
    backupId,
    serverId,
    filename: backup.filename,
  });
}

export async function describeBackupComponents(
  backupId: string,
): Promise<BackupComponents> {
  await connectDB();

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");

  const components: Record<BackupComponent, string[]> = {
    world: [],
    config: [],
    mods: [],
    plugins: [],
    datapacks: [],
  };
  let totalFiles = 0;
  let totalSize = 0;

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();

    extract.on("entry", (header, stream, next) => {
      if (header.type === "file") {
        totalFiles++;
        totalSize += header.size ?? 0;

        const filePath = header.name;
        for (const [comp, dirs] of Object.entries(COMPONENT_DIRS)) {
          if (dirs.some((d) => filePath.startsWith(d + "/") || filePath === d)) {
            components[comp as BackupComponent].push(filePath);
            break;
          }
        }
      }

      stream.resume();
      next();
    });

    extract.on("finish", resolve);
    extract.on("error", reject);

    createReadStream(backup.path).pipe(createGunzip()).pipe(extract);
  });

  return { components, totalFiles, totalSize };
}

export async function publishBackup(
  backupId: string,
): Promise<{ downloadUrl: string }> {
  await connectDB();

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");

  const token = Buffer.from(`${backupId}:${Date.now()}`).toString("base64url");
  return { downloadUrl: `/api/backups/download?token=${token}` };
}
