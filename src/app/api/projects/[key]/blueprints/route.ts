import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import {
  listBlueprints,
  createBlueprint,
} from "@/lib/services/blueprint.service";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const blueprints = await listBlueprints(params.key, session.userId);
    return Response.json(blueprints);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const { name, maxRam } = await req.json();
    const blueprint = await createBlueprint(
      params.key,
      { name, maxRam },
      session.userId,
    );
    return Response.json(blueprint, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
