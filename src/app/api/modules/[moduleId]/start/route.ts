import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { startModule } from "@/lib/services/module-manager.service";

type Params = { moduleId: string };

/**
 * POST /api/modules/[moduleId]/start — Start a stopped module.
 */
export const POST = withPermission<Params>(
  "module.manage",
  async (_req, { params }) => {
    try {
      const result = await startModule(params.moduleId);
      return Response.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  },
);
