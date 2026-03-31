import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { initializeBlueprint } from "@/lib/services/blueprint.service";

export const POST = withAuth(
  async (req: NextRequest, { session, params }) => {
    try {
      const body = await req.json();
      const result = await initializeBlueprint(
        params.blueprintId,
        body,
        session.userId,
      );
      return Response.json(result, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
