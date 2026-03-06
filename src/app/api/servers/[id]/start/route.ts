import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer, startServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

export const POST = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const result = await startServer(params.id, session.userId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
