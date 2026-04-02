import type { NextRequest } from "next/server";
import { errorResponse, unauthorized, badRequest } from "@/lib/api/errors";
import { completeAsyncBackup } from "@/lib/services/backup-strategy.service";

/**
 * POST /api/backups/callback
 * Called by the async-backups module when a backup job completes.
 * Auth: Bearer token matching the module's provisioned API key.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw unauthorized("Missing or invalid Authorization header");
    }

    // Validate the API key against the async-backups module's config
    const { connectDB } = await import("@/lib/db/connection");
    const { InstalledModuleModel } = await import("@/lib/db/models/installed-module");
    await connectDB();

    const mod = await InstalledModuleModel.findOne({ moduleId: "async-backups" }).lean();
    const storedKey = mod?.config.find((c) => c.key === "__API_KEY")?.value;
    const providedKey = authHeader.slice(7);

    if (!storedKey || providedKey !== storedKey) {
      throw unauthorized("Invalid API key");
    }

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
