import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import { createDiscordInvite } from "@/lib/services/discord-module.service";

/**
 * POST /api/servers/[id]/discord/invite/[guildId]
 * Creates a Discord server invite via the bot.
 */
export const POST = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const result = await createDiscordInvite(params.guildId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
