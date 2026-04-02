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

      // Use PUBLIC_SERVER_IP if set (for servers behind reverse proxy),
      // otherwise fall back to the Host header
      const publicHost = process.env.PUBLIC_SERVER_IP
        ?? _req.headers.get("host")?.replace(/:\d+$/, "")
        ?? _req.nextUrl.hostname;
      const moduleUrl = `http://${publicHost}:${mod.assignedPort}`;

      return Response.redirect(moduleUrl, 302);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
