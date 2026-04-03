import { readFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse } from "@/lib/api/errors";
import { getDataDir } from "@/lib/docker/storage";
import { parseMrpack } from "@/lib/services/pack-resolution.service";

export function getMrpackTempDir(): string {
  return path.join(getDataDir(), ".mrpack-uploads");
}

/** Permanent pack file: pack-<uploadId>.mrpack (kept until server creation) */
export function getMrpackPackPath(uploadId: string): string {
  return path.join(getMrpackTempDir(), `pack-${uploadId}.mrpack`);
}

/**
 * Finalizes an .mrpack chunked upload: reads the reassembled temp file,
 * parses modrinth.index.json, and returns pack metadata + uploadId.
 * The .mrpack file is kept on disk so createServer can copy it to /data.
 * Body: { uploadId: string, filename?: string }
 */
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const body = await req.json() as { uploadId?: string; filename?: string };
    const { uploadId } = body;

    if (!uploadId || !/^[a-f0-9-]{36}$/i.test(uploadId)) {
      throw badRequest("Valid uploadId required");
    }

    const dir = getMrpackTempDir();
    await mkdir(dir, { recursive: true });

    const tempPath = path.join(dir, `upload-${uploadId}.tmp`);
    const buf = await readFile(tempPath).catch(() => {
      throw badRequest("Upload-Datei nicht gefunden. Bitte erneut hochladen.");
    });

    const info = await parseMrpack(buf);

    // Rename to a stable name so createServer can find it later
    const packPath = getMrpackPackPath(uploadId);
    await rename(tempPath, packPath).catch(() => {});

    return Response.json({ ok: true, uploadId, data: info });
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
