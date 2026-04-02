import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { describeBackupComponents } from "@/lib/services/backup.service";

export const GET = withAuth(async (_req: NextRequest, { params }) => {
  try {
    const result = await describeBackupComponents(params.backupId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
