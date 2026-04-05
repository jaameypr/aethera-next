import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import {
  getServerDiscordConfig,
  updateServerDiscordConfig,
  deleteServerDiscordConfig,
} from "@/lib/services/discord-module.service";

/**
 * GET /api/servers/[id]/discord — get Discord config for a server.
 * PUT /api/servers/[id]/discord — update Discord config.
 * DELETE /api/servers/[id]/discord — remove Discord config.
 */

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const config = await getServerDiscordConfig(params.id);
    return Response.json(config);
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const body = await req.json();
    const updated = await updateServerDiscordConfig(params.id, body);
    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    await deleteServerDiscordConfig(params.id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
});
