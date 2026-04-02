import { appendFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, badRequest } from "@/lib/api/errors";
import { getBackupDir } from "@/lib/docker/storage";

/**
 * Receives a single chunk of a large file upload.
 * Chunks arrive sequentially; chunk 0 creates / overwrites the temp file,
 * subsequent chunks are appended.
 *
 * Headers:
 *   X-Upload-Id   — client-generated UUID identifying the upload session
 *   X-Chunk-Index  — 0-based chunk number
 * Body: raw binary (application/octet-stream), max ~5 MB per chunk
 */
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const uploadId = req.headers.get("x-upload-id");
    const chunkIndex = parseInt(req.headers.get("x-chunk-index") || "0", 10);

    if (!uploadId || !/^[a-f0-9-]{36}$/i.test(uploadId)) {
      throw badRequest("Valid X-Upload-Id header required");
    }

    const importDir = path.join(getBackupDir(), "imports");
    await mkdir(importDir, { recursive: true });

    const tempPath = path.join(importDir, `upload-${uploadId}.tmp`);
    const chunk = Buffer.from(await req.arrayBuffer());

    if (chunkIndex === 0) {
      await writeFile(tempPath, chunk);
    } else {
      await appendFile(tempPath, chunk);
    }

    return Response.json({ ok: true, chunk: chunkIndex, received: chunk.length });
  } catch (error) {
    console.error("[backup-chunk] Error:", error);
    return errorResponse(error);
  }
});
