import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { getBackupCapabilities } from "@/lib/services/backup-strategy.service";

export const GET = withAuth(async () => {
  try {
    const capabilities = await getBackupCapabilities();
    return Response.json(capabilities);
  } catch (error) {
    return errorResponse(error);
  }
});
