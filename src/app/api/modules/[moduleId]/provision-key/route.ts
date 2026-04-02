import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { provisionApiKey } from "@/lib/services/module-auth.service";

type Params = { moduleId: string };

export const POST = withPermission<Params>(
  "module.manage",
  async (_req, { params }) => {
    try {
      const key = await provisionApiKey(params.moduleId);
      return Response.json({ success: true, keyLength: key.length });
    } catch (err) {
      return errorResponse(err);
    }
  },
);
