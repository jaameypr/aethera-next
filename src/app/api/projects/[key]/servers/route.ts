import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { listServers, createServer } from "@/lib/services/server.service";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const servers = await listServers(params.key, session.userId);
    return Response.json(servers);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const body = await req.json();
    const server = await createServer(params.key, body, session.userId);
    return Response.json(server, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
