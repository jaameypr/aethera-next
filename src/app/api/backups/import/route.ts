import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, badRequest } from "@/lib/api/errors";
import { importBackupViaWorker } from "@/lib/services/backup-strategy.service";
import { downloadFromPaperviewToFile } from "@/lib/services/paperview.service";
import { getBackupDir } from "@/lib/docker/storage";

export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const body = await req.json();

    const importDir = path.join(getBackupDir(), "imports");
    await mkdir(importDir, { recursive: true });

    let tempPath: string;
    let filename: string;

    if (body.url) {
      // Paperview URL download
      console.log(`[backup-import] Downloading from Paperview: ${body.url}`);
      const result = await downloadFromPaperviewToFile(body.url, importDir);
      tempPath = result.tempPath;
      filename = result.filename;
    } else if (body.uploadId) {
      // Finalize a chunked upload
      const uploadId = body.uploadId;
      if (!/^[a-f0-9-]{36}$/i.test(uploadId)) {
        throw badRequest("Invalid uploadId");
      }

      tempPath = path.join(importDir, `upload-${uploadId}.tmp`);
      filename = body.filename || "upload.tar.gz";

      try {
        const s = await stat(tempPath);
        console.log(`[backup-import] Queuing chunked upload: ${filename} (${s.size} bytes)`);
      } catch {
        throw badRequest("Upload not found — chunks may have expired");
      }
    } else {
      throw badRequest("Provide 'url' or 'uploadId'");
    }

    const job = await importBackupViaWorker(tempPath, filename, session.userId);
    console.log(`[backup-import] Job queued: ${job._id}`);

    return Response.json(
      { jobId: job._id.toString(), status: job.status },
      { status: 202 },
    );
  } catch (error) {
    console.error("[backup-import] Error:", error);
    return errorResponse(error);
  }
});
