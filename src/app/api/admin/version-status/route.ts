import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { getUpdateStatus } from "@/lib/services/app-version.service";

/**
 * Update-status feed for the admin dashboard banner.
 *
 * Gated on `admin.system` — any admin may *see* whether an update is
 * available. The update *action* itself requires `system.update` (see the
 * `POST /api/admin/update` endpoint).
 */
export const GET = withPermission("admin.system", async () => {
  try {
    return Response.json(await getUpdateStatus());
  } catch (error) {
    return errorResponse(error);
  }
});
