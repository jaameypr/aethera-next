import type { NextRequest } from "next/server";
import { errorResponse, badRequest } from "@/lib/api/errors";
import { completeAsyncBackup } from "@/lib/services/backup-strategy.service";

/**
 * POST /api/backups/callback
 * Called by the async-backups module when a backup job completes.
 * Secured by Docker network isolation (internal only).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.backupId || !body.jobId || !body.status) {
      throw badRequest("Missing required fields: backupId, jobId, status");
    }

    const backup = await completeAsyncBackup({
      backupId: body.backupId,
      jobId: body.jobId,
      status: body.status,
      filename: body.filename,
      size: body.size,
      path: body.path,
      error: body.error,
      shareUrl: body.shareUrl,
      shareId: body.shareId,
    });

    return Response.json({ success: true, backupId: backup._id.toString() });
  } catch (error) {
    return errorResponse(error);
  }
}
