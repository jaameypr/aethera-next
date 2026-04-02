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
    const formData = await req.formData();
    const url = formData.get("url") as string | null;
    const file = formData.get("file") as File | null;

    const importDir = path.join(getBackupDir(), "imports");
    await mkdir(importDir, { recursive: true });

    let tempPath: string;
    let filename: string;

    if (url) {
      console.log(`[backup-import] Downloading from Paperview: ${url}`);
      const result = await downloadFromPaperviewToFile(url, importDir);
      tempPath = result.tempPath;
      filename = result.filename;
    } else if (file) {
      filename = file.name || "upload.tar.gz";
      tempPath = path.join(importDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      console.log(`[backup-import] Streaming ${filename} (${file.size} bytes) to disk`);
      const nodeStream = Readable.fromWeb(file.stream() as any);
      await pipeline(nodeStream, createWriteStream(tempPath));
      console.log(`[backup-import] File saved to ${tempPath}`);
    } else {
      throw badRequest("Either 'file' or 'url' is required");
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
