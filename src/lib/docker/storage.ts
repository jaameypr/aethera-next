import "server-only";

import { mkdir, rm, stat, readdir } from "node:fs/promises";
import path from "node:path";

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
  return path.resolve(process.env.AETHERA_DATA_DIR || "./.aethera/run");
}

export function getBackupDir(): string {
  return path.resolve(process.env.AETHERA_BACKUP_DIR || "./.aethera/backup");
}

export function getUploadDir(): string {
  return path.resolve(
    process.env.AETHERA_WORLD_UPLOAD_DIR || "./.aethera/world_upload",
  );
}

// ---------------------------------------------------------------------------
// Per-server helpers
// ---------------------------------------------------------------------------

export function getServerDataPath(identifier: string): string {
  return path.resolve(getDataDir(), identifier);
}

export async function ensureServerDir(identifier: string): Promise<void> {
  await mkdir(getServerDataPath(identifier), { recursive: true });
}

export async function deleteServerDir(identifier: string): Promise<void> {
  await rm(getServerDataPath(identifier), { recursive: true, force: true });
}

export async function getServerDirSize(identifier: string): Promise<number> {
  return sumDirSize(getServerDataPath(identifier));
}

export async function listServerFiles(
  identifier: string,
  subpath?: string,
): Promise<FileEntry[]> {
  const base = getServerDataPath(identifier);
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
