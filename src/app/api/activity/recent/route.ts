import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { getGlobalRecent } from "@/lib/services/activity.service";

export const GET = withAuth(async (_req: NextRequest, { session }) => {
  try {
    const entries = await getGlobalRecent(session.userId);
    return Response.json(entries);
  } catch (error) {
    return errorResponse(error);
  }
});
