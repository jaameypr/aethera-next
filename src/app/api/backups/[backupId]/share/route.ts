import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { shareBackup } from "@/lib/services/backup-strategy.service";

export const POST = withAuth(async (_req: NextRequest, { params }) => {
  try {
    const backup = await shareBackup(params.backupId);
    return Response.json({
      shareUrl: backup.shareUrl,
      shareId: backup.shareId,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
