import { withPermission } from "@/lib/auth/guards";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { connectDB } from "@/lib/db/connection";
import { errorResponse, notFound } from "@/lib/api/errors";

type Params = { moduleId: string };

/**
 * GET /api/modules/[moduleId]/launch — Open the module UI.
 *
 * Priority: publicUrl (admin-configured) > fallback IP:port.
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
      if (mod.exposure !== "public") throw notFound("Module has no public UI");

      // Use admin-configured publicUrl if set, otherwise build from host + port
      let moduleUrl = mod.publicUrl;
      if (!moduleUrl && mod.assignedPort) {
        const host = _req.headers.get("host")?.replace(/:\d+$/, "")
          ?? _req.nextUrl.hostname;
        moduleUrl = `http://${host}:${mod.assignedPort}`;
      }

      if (!moduleUrl) throw notFound("Module URL not configured");

      return Response.redirect(moduleUrl, 302);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
