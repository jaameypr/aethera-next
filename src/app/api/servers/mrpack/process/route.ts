import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse } from "@/lib/api/errors";
import { getDataDir } from "@/lib/docker/storage";
import { parseMrpack } from "@/lib/services/pack-resolution.service";

function getMrpackTempDir(): string {
  return path.join(getDataDir(), ".mrpack-uploads");
}

/**
 * Finalizes an .mrpack chunked upload: reads the reassembled temp file,
 * parses modrinth.index.json, and returns pack metadata.
 * Body: { uploadId: string, filename?: string }
 */
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json() as { uploadId?: string; filename?: string };
    const { uploadId } = body;

    if (!uploadId || !/^[a-f0-9-]{36}$/i.test(uploadId)) {
      throw badRequest("Valid uploadId required");
    }

    const tempPath = path.join(getMrpackTempDir(), `upload-${uploadId}.tmp`);
    const buf = await readFile(tempPath).catch(() => {
      throw badRequest("Upload-Datei nicht gefunden. Bitte erneut hochladen.");
    });

    const info = await parseMrpack(buf);

    // Clean up temp file (best-effort)
    unlink(tempPath).catch(() => {});

    return Response.json({ ok: true, data: info });
  } catch (error) {
    console.error("[mrpack-process] Error:", error);
    if (error instanceof Error && "statusCode" in error) {
      return errorResponse(error);
    }
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" },
      { status: 400 },
    );
  }
});
