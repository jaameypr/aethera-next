import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse } from "@/lib/api/errors";
import { getDataDir } from "@/lib/docker/storage";

function getMrpackTempDir(): string {
  return path.join(getDataDir(), ".mrpack-uploads");
}

/**
 * Receives one chunk of an .mrpack file upload.
 * Headers: X-Upload-Id (UUID), X-Chunk-Index (0-based)
 * Body: raw binary (application/octet-stream), max ~5 MB per chunk
 */
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const uploadId = req.headers.get("x-upload-id");
    const chunkIndex = parseInt(req.headers.get("x-chunk-index") || "0", 10);

    if (!uploadId || !/^[a-f0-9-]{36}$/i.test(uploadId)) {
      throw badRequest("Valid X-Upload-Id header required");
    }

    const tempDir = getMrpackTempDir();
    await mkdir(tempDir, { recursive: true });

    const tempPath = path.join(tempDir, `upload-${uploadId}.tmp`);
    const chunk = Buffer.from(await req.arrayBuffer());

    if (chunkIndex === 0) {
      await writeFile(tempPath, chunk);
    } else {
      await appendFile(tempPath, chunk);
    }

    return Response.json({ ok: true, chunk: chunkIndex, received: chunk.length });
  } catch (error) {
    console.error("[mrpack-chunk] Error:", error);
    return errorResponse(error);
  }
});
