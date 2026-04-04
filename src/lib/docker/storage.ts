import "server-only";

import { mkdir, rm, stat, readdir, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: Date;
}

// ---------------------------------------------------------------------------
// Base directories (resolved to absolute paths)
// ---------------------------------------------------------------------------

export function getDataDir(): string {
  if (process.env.AETHERA_DATA_DIR) {
    return path.resolve(process.env.AETHERA_DATA_DIR);
  }
  return path.resolve(process.cwd(), ".aethera", "run");
}

export function getBackupDir(): string {
  if (process.env.AETHERA_BACKUP_DIR) {
    return path.resolve(process.env.AETHERA_BACKUP_DIR);
  }
  return path.resolve(process.cwd(), ".aethera", "backup");
}

export function getUploadDir(): string {
  if (process.env.AETHERA_WORLD_UPLOAD_DIR) {
    return path.resolve(process.env.AETHERA_WORLD_UPLOAD_DIR);
  }
  return path.resolve(process.cwd(), ".aethera", "world_upload");
}

// ---------------------------------------------------------------------------
// Per-server helpers
// ---------------------------------------------------------------------------

export function getServerDataPath(projectKey: string, identifier: string): string {
  return path.resolve(getDataDir(), `${projectKey}-${identifier}`);
}

export async function resolveServerDataPath(projectKey: string, identifier: string): Promise<string> {
  const newPath = getServerDataPath(projectKey, identifier);
  try {
    await stat(newPath);
    return newPath;
  } catch {
    const legacyPath = path.resolve(getDataDir(), identifier);
    try {
      await stat(legacyPath);
      return legacyPath;
    } catch {
      return newPath;
    }
  }
}

export async function ensureServerDir(projectKey: string, identifier: string): Promise<void> {
  const newDir = getServerDataPath(projectKey, identifier);
  const legacyDir = path.resolve(getDataDir(), identifier);
  try {
    await stat(legacyDir);
    try { await stat(newDir); } catch {
      await rename(legacyDir, newDir);
      console.log(`[storage] Migrated server dir: ${identifier} → ${projectKey}-${identifier}`);
    }
  } catch { /* legacy doesn't exist */ }
  await mkdir(newDir, { recursive: true });
  try { await execFileAsync("chown", ["-R", "1000:1000", newDir]); } catch {}
}

export async function deleteServerDir(projectKey: string, identifier: string): Promise<void> {
  await rm(getServerDataPath(projectKey, identifier), { recursive: true, force: true });
  await rm(path.resolve(getDataDir(), identifier), { recursive: true, force: true }).catch(() => {});
}

export async function getServerDirSize(projectKey: string, identifier: string): Promise<number> {
  return sumDirSize(await resolveServerDataPath(projectKey, identifier));
}

export async function listServerFiles(
  projectKey: string,
  identifier: string,
  subpath?: string,
): Promise<FileEntry[]> {
  const base = await resolveServerDataPath(projectKey, identifier);
  const target = subpath ? path.resolve(base, subpath) : base;
  return collectFiles(target, base);
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

async function sumDirSize(dir: string): Promise<number> {
  let total = 0;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await sumDirSize(fullPath);
    } else {
      try {
        const s = await stat(fullPath);
        total += s.size;
      } catch {
        // file may have been removed between readdir and stat
      }
    }
  }

  return total;
}

async function collectFiles(
  dir: string,
  baseDir: string,
): Promise<FileEntry[]> {
  const results: FileEntry[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    try {
      const s = await stat(fullPath);
      const relativePath = path.relative(baseDir, fullPath);

      results.push({
        name: entry.name,
        path: relativePath,
        size: s.size,
        isDirectory: entry.isDirectory(),
        modifiedAt: s.mtime,
      });

      if (entry.isDirectory()) {
        results.push(...(await collectFiles(fullPath, baseDir)));
      }
    } catch {
      // entry disappeared between readdir and stat
    }
  }

  return results;
}
