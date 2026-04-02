import "server-only";

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
 * Upload a backup file to Paperview and return a share link.
 */
export async function uploadBackupToShare(opts: {
  file: Buffer;
  filename: string;
  title: string;
  description?: string;
  expiresAt?: Date;
}): Promise<PaperviewShareResult> {
  const { internalUrl, apiKey } = await getPaperviewConfig();

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(opts.file)]),
    opts.filename,
  );
  formData.append("title", opts.title);

  if (opts.description) {
    formData.append("description", opts.description);
  }

  formData.append("visibility", "public");
  formData.append("downloadEnabled", "true");
  formData.append("commentsEnabled", "false");
  formData.append("previewMode", "download_only");

  if (opts.expiresAt) {
    formData.append("expiresAt", opts.expiresAt.toISOString());
  }

  const res = await fetch(`${internalUrl}/api/shares`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(120_000), // 2 min for large files
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Paperview upload failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const share = data.share;

  // Build the external share URL — prefer the admin-configured publicUrl
  const mod = await InstalledModuleModel.findOne({ moduleId: "paperview" }).lean();
  const baseUrl = mod?.publicUrl
    || (mod?.assignedPort ? `http://localhost:${mod.assignedPort}` : internalUrl);

  return {
    shareId: share._id,
    title: share.title,
    shareUrl: `${baseUrl}/shares/${share._id}`,
  };
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
 * Download a file from a Paperview share URL.
 */
export async function downloadFromPaperview(
  shareUrl: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const match = shareUrl.match(/\/shares\/([a-f0-9]+)\/?$/i);
  if (!match) throw new Error("Invalid Paperview share URL");
  const shareId = match[1];

  const { internalUrl, apiKey } = await getPaperviewConfig();

  const res = await fetch(`${internalUrl}/api/shares/${shareId}/download`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Paperview download failed (${res.status}): ${body}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let filename = "backup.tar.gz";
  const disposition = res.headers.get("content-disposition");
  if (disposition) {
    const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/i);
    if (filenameMatch) filename = filenameMatch[1].trim();
  }

  return { buffer, filename };
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
