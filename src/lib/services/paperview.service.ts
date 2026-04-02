import "server-only";

import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getPaperviewConfig(): Promise<{
  internalUrl: string;
  apiKey: string;
}> {
  await connectDB();

  const mod = await InstalledModuleModel.findOne({
    moduleId: "paperview",
  }).lean();

  if (!mod) throw new Error("Paperview module is not installed");
  if (mod.status !== "running") throw new Error("Paperview module is not running");
  if (!mod.internalUrl) throw new Error("Paperview URL not configured");

  const apiKey = mod.config.find((c) => c.key === "__API_KEY")?.value;
  if (!apiKey) throw new Error("Paperview API key not provisioned");

  return { internalUrl: mod.internalUrl, apiKey };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface PaperviewShareResult {
  shareId: string;
  title: string;
  shareUrl: string;
}

/**
 * Upload a backup file to Paperview using chunked uploads.
 * Streams from disk in 5 MB chunks — safe for multi-GB files.
 */
export async function uploadBackupToShare(opts: {
  filePath: string;
  filename: string;
  title: string;
  description?: string;
  expiresAt?: Date;
}): Promise<PaperviewShareResult> {
  const { internalUrl, apiKey } = await getPaperviewConfig();

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
  const fileStats = await stat(opts.filePath);
  const totalSize = fileStats.size;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const uploadId = crypto.randomUUID();

  console.log(
    `[paperview] Uploading ${opts.filename} (${totalSize} bytes) in ${totalChunks} chunks`,
  );

  // Send each chunk to Paperview's chunk endpoint
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);

    const chunkBuf = await readFileChunk(opts.filePath, start, end);

    const res = await fetch(`${internalUrl}/api/upload/chunk`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/octet-stream",
        "X-Upload-Id": uploadId,
        "X-Chunk-Index": String(i),
      },
      body: chunkBuf,
      signal: AbortSignal.timeout(300_000), // 5 min per chunk
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Paperview chunk upload failed (${res.status}): ${body}`,
      );
    }
  }

  console.log(`[paperview] All chunks sent, finalizing share`);

  // Finalize: create the share from the assembled file
  const res = await fetch(`${internalUrl}/api/shares`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uploadId,
      filename: opts.filename,
      title: opts.title,
      description: opts.description ?? "",
      visibility: "public",
      downloadEnabled: true,
      commentsEnabled: false,
      previewMode: "download_only",
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt.toISOString() } : {}),
    }),
    signal: AbortSignal.timeout(600_000), // 10 min for finalization
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Paperview share creation failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const share = data.share;

  const mod = await InstalledModuleModel.findOne({
    moduleId: "paperview",
  }).lean();
  const baseUrl =
    mod?.publicUrl ||
    (mod?.assignedPort
      ? `http://localhost:${mod.assignedPort}`
      : internalUrl);

  return {
    shareId: share._id,
    title: share.title,
    shareUrl: `${baseUrl}/shares/${share._id}`,
  };
}

/** Read a specific byte range from a file into an ArrayBuffer */
async function readFileChunk(
  filePath: string,
  start: number,
  end: number,
): Promise<ArrayBuffer> {
  const { open } = await import("node:fs/promises");
  const fh = await open(filePath, "r");
  try {
    const length = end - start;
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } finally {
    await fh.close();
  }
}

/**
 * List shares from Paperview (backups uploaded by Aethera).
 */
export async function listShares(): Promise<
  Array<{
    _id: string;
    title: string;
    kind: string;
    createdAt: string;
  }>
> {
  const { internalUrl, apiKey } = await getPaperviewConfig();

  const res = await fetch(`${internalUrl}/api/shares`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to list Paperview shares (${res.status})`);
  }

  const data = await res.json();
  return data.shares ?? [];
}

/**
 * Download a file from a Paperview share URL directly to disk.
 * Streams the response — safe for multi-GB files.
 */
export async function downloadFromPaperviewToFile(
  shareUrl: string,
  destDir: string,
): Promise<{ tempPath: string; filename: string }> {
  const match = shareUrl.match(/\/shares\/([a-f0-9]+)\/?$/i);
  if (!match) throw new Error("Invalid Paperview share URL");
  const shareId = match[1];

  const { internalUrl, apiKey } = await getPaperviewConfig();

  // Step 1: Fetch share metadata to get currentVersionId
  const metaRes = await fetch(`${internalUrl}/api/shares/${shareId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => "");
    throw new Error(`Paperview share metadata failed (${metaRes.status}): ${body}`);
  }
  const metaData = await metaRes.json();
  const versionId =
    metaData?.share?.currentVersionId ?? metaData?.currentVersionId;
  if (!versionId) throw new Error("Paperview share has no current version");

  // Step 2: Download via the versioned file endpoint
  const res = await fetch(
    `${internalUrl}/api/shares/${shareId}/versions/${versionId}/file`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3_600_000), // 1 hour for large files
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Paperview download failed (${res.status}): ${body}`);
  }

  let filename = "backup.tar.gz";
  const disposition = res.headers.get("content-disposition");
  if (disposition) {
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
    if (filenameMatch) filename = decodeURIComponent(filenameMatch[1].trim());
  }

  if (!res.body) throw new Error("Empty response body from Paperview");

  await mkdir(destDir, { recursive: true });
  const tempPath = path.join(
    destDir,
    `download-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const nodeStream = Readable.fromWeb(res.body as any);
  await pipeline(nodeStream, createWriteStream(tempPath));

  return { tempPath, filename };
}

/**
 * Check if Paperview is installed and has a valid API key.
 */
export async function isPaperviewReady(): Promise<boolean> {
  try {
    await getPaperviewConfig();
    return true;
  } catch (err) {
    console.log("[paperview] Not ready:", (err as Error).message);
    return false;
  }
}
