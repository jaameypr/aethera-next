import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { reinstallModule } from "@/lib/services/module-manager.service";

type Params = { moduleId: string };

/**
 * POST /api/modules/[moduleId]/reinstall
 * Stops and removes the existing container, then redeploys it using the
 * stored manifest and config. Env vars and API keys are preserved.
 */
export const POST = withPermission<Params>(
  "module.manage",
  async (_req, { params }) => {
    try {
      const result = await reinstallModule(params.moduleId);
      return Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
