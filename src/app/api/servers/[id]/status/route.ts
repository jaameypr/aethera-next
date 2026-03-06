import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer, getServerStatus } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import { syncServerStatus } from "@/lib/docker/status-sync";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    // Sync DB with actual Docker state before responding
    await syncServerStatus(params.id);

    const status = await getServerStatus(params.id);
    return Response.json(status);
  } catch (error) {
    return errorResponse(error);
  }
});
