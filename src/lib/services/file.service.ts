import "server-only";

import { readdir, readFile as fsReadFile, writeFile as fsWriteFile, rm, stat, mkdir, rename as fsRename } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import archiver from "archiver";
import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getServerDataPath } from "@/lib/docker/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  children?: FileTreeNode[];
}

const MAX_DEPTH = 5;

// ---------------------------------------------------------------------------
// Path security
// ---------------------------------------------------------------------------

async function resolveServerPath(
  serverId: string,
  filepath: string,
): Promise<{ serverDir: string; resolved: string }> {
  await connectDB();
  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");

  const serverDir = getServerDataPath(server.identifier);
  const resolved = path.resolve(serverDir, filepath);

  // Ensure the resolved path is within the server directory
  const normalizedServer = path.normalize(serverDir) + path.sep;
  const normalizedResolved = path.normalize(resolved);
  if (
    normalizedResolved !== path.normalize(serverDir) &&
    !normalizedResolved.startsWith(normalizedServer)
  ) {
    throw new Error("Access denied: path is outside the server directory");
  }

  return { serverDir, resolved };
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------

async function buildTree(
  dir: string,
  baseDir: string,
  depth: number,
): Promise<FileTreeNode[]> {
  if (depth > MAX_DEPTH) return [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);
    try {
      const s = await stat(fullPath);
      const relativePath = path.relative(baseDir, fullPath);
      const node: FileTreeNode = {
        name: entry.name,
        path: relativePath,
        isDirectory: entry.isDirectory(),
        size: s.size,
        modifiedAt: s.mtime,
      };

      if (entry.isDirectory()) {
        node.children = await buildTree(fullPath, baseDir, depth + 1);
      }

      nodes.push(node);
    } catch {
      // entry may have been removed
    }
  }

  return nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getFileTree(serverId: string): Promise<FileTreeNode[]> {
  const { serverDir } = await resolveServerPath(serverId, ".");
  return buildTree(serverDir, serverDir, 0);
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export async function readFile(
  serverId: string,
  filepath: string,
): Promise<{ content: string; size: number }> {
  const { resolved } = await resolveServerPath(serverId, filepath);

  const s = await stat(resolved);
  if (s.isDirectory()) throw new Error("Cannot read a directory");

  const content = await fsReadFile(resolved, "utf-8");
  return { content, size: s.size };
}

export async function writeFile(
  serverId: string,
  filepath: string,
  content: string,
): Promise<void> {
  const { resolved } = await resolveServerPath(serverId, filepath);

  await mkdir(path.dirname(resolved), { recursive: true });
  await fsWriteFile(resolved, content, "utf-8");
}

export async function deleteFile(
  serverId: string,
  filepath: string,
): Promise<void> {
  const { resolved } = await resolveServerPath(serverId, filepath);
  await rm(resolved, { recursive: true, force: true });
}

export async function uploadFile(
  serverId: string,
  filepath: string,
  file: File,
): Promise<void> {
  const { resolved } = await resolveServerPath(serverId, filepath);

  await mkdir(path.dirname(resolved), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fsWriteFile(resolved, buffer);
}

export async function moveFile(
  serverId: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const { resolved: from } = await resolveServerPath(serverId, fromPath);
  const { resolved: to } = await resolveServerPath(serverId, toPath);

  // Guard against moving into itself or a child of itself
  const fromNorm = path.normalize(from) + path.sep;
  if (path.normalize(to) === path.normalize(from) || path.normalize(to).startsWith(fromNorm)) {
    throw new Error("Cannot move a path into itself or one of its subdirectories");
  }

  await mkdir(path.dirname(to), { recursive: true });
  await fsRename(from, to);
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

function nodeStreamToWeb(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export async function downloadFile(
  serverId: string,
  filepath: string,
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string; size: number }> {
  const { resolved } = await resolveServerPath(serverId, filepath);
  const s = await stat(resolved);
  if (s.isDirectory()) throw new Error("Path is a directory – use downloadFolderAsZip instead");

  return {
    stream: nodeStreamToWeb(createReadStream(resolved)),
    filename: path.basename(resolved),
    size: s.size,
  };
}

export async function downloadFolderAsZip(
  serverId: string,
  folderPath: string,
): Promise<{ stream: ReadableStream<Uint8Array>; filename: string }> {
  const { resolved } = await resolveServerPath(serverId, folderPath);
  const s = await stat(resolved);
  if (!s.isDirectory()) throw new Error("Path is not a directory");

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.directory(resolved, false);
  archive.finalize();

  return {
    stream: nodeStreamToWeb(archive),
    filename: path.basename(resolved) + ".zip",
  };
}
