import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
import { getDiscordChannels } from "@/lib/services/discord-module.service";

/**
 * GET /api/servers/[id]/discord/channels/[guildId]
 * Returns text channels for a Discord guild.
 */
export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const channels = await getDiscordChannels(params.guildId);
    return Response.json(channels);
  } catch (error) {
    return errorResponse(error);
  }
});
