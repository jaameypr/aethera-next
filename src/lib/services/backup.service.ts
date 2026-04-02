import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, readdir, rename, open as fsOpen } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import mongoose from "mongoose";
import tar from "tar-stream";
import yauzl from "yauzl";
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

const execFileAsync = promisify(execFile);

/** itzg/minecraft-server runs as UID/GID 1000 — fix ownership after restore */
async function fixOwnership(dirPath: string): Promise<void> {
  try {
    await execFileAsync("chown", ["-R", "1000:1000", dirPath]);
  } catch {
    // chown may not be available (e.g., on Windows dev), ignore silently
  }
}

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

  await fixOwnership(serverDir);

  await logAction(server.projectKey, "BACKUP_RESTORED", backup.createdBy.toString(), {
    backupId,
    serverId,
    filename: backup.filename,
  });
}

export async function restoreBackupSelective(
  backupId: string,
  serverId: string,
  components: BackupComponent[],
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw new Error("Server must be stopped to restore a backup");
  }

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");

  // Build a set of prefixes that should be extracted
  const allowedPrefixes: string[] = [];
  for (const comp of components) {
    const dirs = COMPONENT_DIRS[comp] ?? [];
    for (const d of dirs) {
      allowedPrefixes.push(d + "/");
      allowedPrefixes.push(d); // exact match for single files like server.properties
    }
  }

  const serverDir = getServerDataPath(server.identifier);

  await new Promise<void>((resolve, reject) => {
    const extract = tar.extract();

    extract.on("entry", (header, stream, next) => {
      const filePath = header.name;
      const matches = allowedPrefixes.some(
        (p) => filePath === p || filePath.startsWith(p.endsWith("/") ? p : p + "/"),
      );

      if (!matches) {
        stream.resume();
        next();
        return;
      }

      const destPath = path.resolve(serverDir, filePath);

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

  await fixOwnership(serverDir);

  await logAction(server.projectKey, "BACKUP_RESTORED", backup.createdBy.toString(), {
    backupId,
    serverId,
    filename: backup.filename,
    components,
  });
}

// ---------------------------------------------------------------------------
// ZIP handling — fully streaming via yauzl (no memory buffering)
// ---------------------------------------------------------------------------

async function isZipFile(filePath: string): Promise<boolean> {
  const fh = await fsOpen(filePath, "r");
  try {
    const buf = Buffer.alloc(4);
    await fh.read(buf, 0, 4, 0);
    return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  } finally {
    await fh.close();
  }
}

function detectComponentsFromPaths(paths: string[]): BackupComponent[] {
  const componentSet = new Set<BackupComponent>();
  for (const entryPath of paths) {
    for (const [comp, dirs] of Object.entries(COMPONENT_DIRS)) {
      if (dirs.some((d) => entryPath.startsWith(d + "/") || entryPath === d)) {
        componentSet.add(comp as BackupComponent);
        break;
      }
    }
  }
  return [...componentSet];
}

/**
 * Stream-convert a ZIP file on disk to a tar.gz file on disk.
 * Uses yauzl (random-access, one entry at a time) so memory stays low
 * even for multi-GB archives.
 */
async function convertZipToTarGz(
  zipPath: string,
  tarGzPath: string,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error("Failed to open ZIP"));

      const entryPaths: string[] = [];
      const pack = tar.pack();
      const gzip = createGzip();
      const output = createWriteStream(tarGzPath);

      pack.pipe(gzip).pipe(output);
      pack.on("error", reject);
      gzip.on("error", reject);
      output.on("error", reject);
      output.on("finish", () => resolve(entryPaths));

      zipfile.readEntry();

      zipfile.on("entry", (entry: yauzl.Entry) => {
        const name = entry.fileName.replace(/\\/g, "/");

        // Skip directory entries — tar-stream creates them implicitly
        if (/\/$/.test(name)) {
          zipfile.readEntry();
          return;
        }

        entryPaths.push(name);

        zipfile.openReadStream(entry, (err, readStream) => {
          if (err || !readStream) return reject(err ?? new Error("Failed to read ZIP entry"));

          const tarEntry = pack.entry(
            { name, size: entry.uncompressedSize, mtime: entry.getLastModDate() },
            (err) => {
              if (err) return reject(err);
              zipfile.readEntry();
            },
          );

          readStream.pipe(tarEntry);
        });
      });

      zipfile.on("end", () => pack.finalize());
      zipfile.on("error", reject);
    });
  });
}

// ---------------------------------------------------------------------------
// Import — works entirely with files on disk (no Buffer loading)
// ---------------------------------------------------------------------------

/**
 * Import a backup from a file already saved to disk.
 * Handles both .tar.gz and .zip (auto-converts ZIP → tar.gz).
 * Returns the created backup record.
 */
export async function importBackup(
  tempFilePath: string,
  filename: string,
  actorId: string,
): Promise<IBackup> {
  await connectDB();

  const importDir = path.join(getBackupDir(), "imports");
  await mkdir(importDir, { recursive: true });

  const isZip = await isZipFile(tempFilePath);
  let finalPath: string;
  let storedFilename: string;
  let entryPaths: string[];

  if (isZip) {
    storedFilename = filename.replace(/\.zip$/i, ".tar.gz");
    finalPath = path.join(importDir, `${Date.now()}-${storedFilename}`);
    entryPaths = await convertZipToTarGz(tempFilePath, finalPath);
    await rm(tempFilePath, { force: true });
  } else {
    storedFilename = filename;
    finalPath = path.join(importDir, `${Date.now()}-${storedFilename}`);
    await rename(tempFilePath, finalPath);

    // Stream through tar entries to detect components
    entryPaths = [];
    await new Promise<void>((resolve, reject) => {
      const extract = tar.extract();

      extract.on("entry", (header, stream, next) => {
        if (header.type === "file") entryPaths.push(header.name);
        stream.resume();
        next();
      });

      extract.on("finish", resolve);
      extract.on("error", reject);

      createReadStream(finalPath).pipe(createGunzip()).pipe(extract);
    });
  }

  const detectedComponents = detectComponentsFromPaths(entryPaths);
  const fileStat = await stat(finalPath);

  const backup = await BackupModel.create({
    serverId: new mongoose.Types.ObjectId("000000000000000000000000"),
    name: filename.replace(/\.(tar\.gz|tgz|zip)$/i, ""),
    filename: storedFilename,
    path: finalPath,
    size: fileStat.size,
    components: detectedComponents,
    status: "completed",
    strategy: "import",
    createdBy: actorId,
  });

  return backup.toObject() as IBackup;
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
