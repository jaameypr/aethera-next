import { withPermission } from "@/lib/auth/guards";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { connectDB } from "@/lib/db/connection";
import { errorResponse, notFound } from "@/lib/api/errors";

type Params = { moduleId: string };

/**
 * GET /api/modules/[moduleId]/launch — Open the module UI.
 *
 * For public Docker modules: redirects to the server's public address + assigned port.
 * Internal/code modules have no browser-facing URL.
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

      if (!mod.assignedPort) {
        throw notFound("Module has no public UI");
      }

      // Build external URL using the request's hostname (= public server address)
      const host = _req.nextUrl.hostname;
      const protocol = _req.nextUrl.protocol; // "http:" or "https:"
      const moduleUrl = `${protocol}//${host}:${mod.assignedPort}`;

      return Response.redirect(moduleUrl, 302);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
