import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer, updateServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    return Response.json(server.properties ?? {});
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const properties = await req.json();
    const updated = await updateServer(params.id, { properties });
    return Response.json(updated.properties);
  } catch (error) {
    return errorResponse(error);
  }
});
