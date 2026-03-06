import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer, recreateServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

export const POST = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    await recreateServer(params.id, session.userId);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
