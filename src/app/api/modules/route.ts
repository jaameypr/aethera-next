import type { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { errorResponse, badRequest } from "@/lib/api/errors";
import {
  listInstalledModules,
  installModule,
} from "@/lib/services/module-manager.service";

/**
 * GET /api/modules — List all installed modules.
 */
export const GET = withPermission("module.access", async () => {
  try {
    const modules = await listInstalledModules();
    return Response.json(modules);
  } catch (err) {
    return errorResponse(err);
  }
});

/**
 * POST /api/modules — Install a module.
 * Body: { moduleId: string, version: string, config?: Record<string, string> }
 */
export const POST = withPermission(
  "module.manage",
  async (req: NextRequest, { session }) => {
    try {
      const body = await req.json();
      const { moduleId, version, config } = body;

      if (!moduleId || !version) {
        throw badRequest("moduleId and version are required");
      }

      const result = await installModule(
        moduleId,
        version,
        session.userId,
        config,
      );
      return Response.json(result, { status: 201 });
    } catch (err) {
      return errorResponse(err);
    }
  },
);
