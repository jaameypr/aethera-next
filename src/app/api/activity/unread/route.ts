import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { getUnreadSummary } from "@/lib/services/activity.service";

export const GET = withAuth(async (_req: NextRequest, { session }) => {
  try {
    const summary = await getUnreadSummary(session.userId);
    return Response.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
});
