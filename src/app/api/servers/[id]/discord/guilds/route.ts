import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import {
  getDiscordGuilds,
  getDiscordBotInviteUrl,
} from "@/lib/services/discord-module.service";

/**
 * GET /api/servers/[id]/discord/guilds
 * Returns the list of Discord guilds the bot is in, plus the bot invite URL.
 */
export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const [guilds, botInvite] = await Promise.all([
      getDiscordGuilds(),
      getDiscordBotInviteUrl(),
    ]);

    return Response.json({ guilds, botInviteUrl: botInvite.url });
  } catch (error) {
    return errorResponse(error);
  }
});
