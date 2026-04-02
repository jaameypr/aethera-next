import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, badRequest } from "@/lib/api/errors";
import { importBackup } from "@/lib/services/backup.service";
import { downloadFromPaperviewToFile } from "@/lib/services/paperview.service";
import { getBackupDir } from "@/lib/docker/storage";

export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    const importDir = path.join(getBackupDir(), "imports");
    await mkdir(importDir, { recursive: true });

    let tempPath: string;
    let filename: string;

    if (contentType.includes("application/json")) {
      // URL import (Paperview)
      const { url } = await req.json();
      if (!url || typeof url !== "string") throw badRequest("'url' is required");

      console.log(`[backup-import] Downloading from Paperview: ${url}`);
      const result = await downloadFromPaperviewToFile(url, importDir);
      tempPath = result.tempPath;
      filename = result.filename;
    } else {
      // Raw binary file upload — streams directly to disk, no buffering
      const headerName = req.headers.get("x-filename");
      filename = headerName ? decodeURIComponent(headerName) : "upload.tar.gz";

      if (!req.body) throw badRequest("No request body");

      tempPath = path.join(importDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      console.log(`[backup-import] Streaming ${filename} to disk`);

      const nodeStream = Readable.fromWeb(req.body as any);
      await pipeline(nodeStream, createWriteStream(tempPath));
      console.log(`[backup-import] File saved to ${tempPath}`);
    }

    console.log(`[backup-import] Processing ${filename}`);
    const backup = await importBackup(tempPath, filename, session.userId);
    console.log(`[backup-import] Success: ${backup._id} — components: ${backup.components.join(", ")}`);
    return Response.json(backup, { status: 201 });
  } catch (error) {
    console.error("[backup-import] Error:", error);
    return errorResponse(error);
  }
});
