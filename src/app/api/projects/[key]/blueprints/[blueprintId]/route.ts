import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { deleteBlueprint } from "@/lib/services/blueprint.service";

export const DELETE = withAuth(
  async (_req: NextRequest, { session, params }) => {
    try {
      await deleteBlueprint(params.blueprintId, session.userId);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
