import { withPermission } from "@/lib/auth/guards";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { errorResponse, notFound, forbidden } from "@/lib/api/errors";
import { hasPermission } from "@/lib/permissions";
import { RoleModel } from "@/lib/db/models/role";
import { generateModuleToken } from "@/lib/services/module-auth.service";

type Params = { moduleId: string };

/**
 * GET /api/modules/[moduleId]/launch — SSO redirect to module.
 *
 * 1. Verify user has permission to access this module
 * 2. Generate a short-lived module_auth JWT
 * 3. Redirect to the module's auth callback with the token
 */
export const GET = withPermission<Params>(
  "module.access",
  async (_req, { session, params }) => {
    try {
      await connectDB();

      const mod = await InstalledModuleModel.findOne({
        moduleId: params.moduleId,
      }).lean();
      if (!mod) throw notFound("Module not installed");
      if (mod.status !== "running") {
        throw notFound("Module is not running");
      }

      // Check module-specific permission
      const user = await UserModel.findById(session.userId).lean();
      if (!user) throw notFound("User not found");

      const roleDocs = await RoleModel.find({
        name: { $in: user.roles },
      }).lean();
      const rolePerms = roleDocs.flatMap((r) => r.permissions);

      const modulePermission = `module.${params.moduleId}.access`;
      if (
        !hasPermission(user.permissions, rolePerms, modulePermission) &&
        !hasPermission(user.permissions, rolePerms, "module.*") &&
        !hasPermission(user.permissions, rolePerms, "*")
      ) {
        throw forbidden("No access to this module");
      }

      // Generate SSO token
      const token = await generateModuleToken(
        session,
        params.moduleId,
        user.username,
      );

      // Build redirect URL
      const manifest = mod.manifest as Record<string, unknown>;
      const auth = manifest.auth as
        | { callbackPath?: string }
        | undefined;
      const callbackPath = auth?.callbackPath ?? "/api/auth/aethera";

      // For Docker modules, use the assigned port for external access
      // or internal URL for server-side calls
      const moduleBaseUrl = mod.assignedPort
        ? `${_req.nextUrl.origin.replace(/:\d+$/, "")}:${mod.assignedPort}`
        : mod.internalUrl;

      if (!moduleBaseUrl) {
        throw notFound("Module URL not configured");
      }

      const redirectUrl = `${moduleBaseUrl}${callbackPath}?token=${encodeURIComponent(token)}`;

      return Response.redirect(redirectUrl, 302);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
