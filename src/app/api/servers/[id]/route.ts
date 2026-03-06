import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import {
  getServer,
  updateServer,
  deleteServer,
} from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    return Response.json(server);
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const body = await req.json();
    const updated = await updateServer(params.id, body);
    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(
  async (_req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      if (!(await canAccessServer(server, session.userId))) throw forbidden();

      await deleteServer(params.id, session.userId);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
