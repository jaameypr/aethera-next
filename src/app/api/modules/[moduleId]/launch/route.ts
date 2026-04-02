import { withPermission } from "@/lib/auth/guards";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { connectDB } from "@/lib/db/connection";
import { errorResponse, notFound } from "@/lib/api/errors";

type Params = { moduleId: string };

/**
 * GET /api/modules/[moduleId]/launch — Open the module UI.
 *
 * For Docker modules: redirects to the module's external URL.
 * The module handles its own auth (admin logs in normally).
 */
export const GET = withPermission<Params>(
  "module.access",
  async (_req, { params }) => {
    try {
      await connectDB();

      const mod = await InstalledModuleModel.findOne({
        moduleId: params.moduleId,
      }).lean();
      if (!mod) throw notFound("Module not installed");
      if (mod.status !== "running") throw notFound("Module is not running");

      // Use assigned port for browser access, fall back to internal URL
      const moduleUrl = mod.assignedPort
        ? `${_req.nextUrl.origin.replace(/:\d+$/, "")}:${mod.assignedPort}`
        : mod.internalUrl;

      if (!moduleUrl) throw notFound("Module URL not configured");

      return Response.redirect(moduleUrl, 302);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
