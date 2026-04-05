import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import { getPendingWhitelistRequests } from "@/lib/services/discord-module.service";

/**
 * GET /api/servers/[id]/discord/whitelist-requests
 * Returns pending whitelist requests for the server.
 */
export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const requests = await getPendingWhitelistRequests(params.id);
    return Response.json(requests);
  } catch (error) {
    return errorResponse(error);
  }
});
