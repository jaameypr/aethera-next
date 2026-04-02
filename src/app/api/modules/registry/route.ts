import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { getModuleCatalog } from "@/lib/services/module-registry.service";

/**
 * GET /api/modules/registry — Fetch available modules from remote registry.
 * Returns combined view: registry entries + install status + update availability.
 */
export const GET = withPermission("module.manage", async () => {
  try {
    const catalog = await getModuleCatalog();
    return Response.json(catalog);
  } catch (err) {
    return errorResponse(err);
  }
});
