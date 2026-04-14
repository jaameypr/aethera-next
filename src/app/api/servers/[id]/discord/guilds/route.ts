import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
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
    await assertServerPermission(server, session.userId, "server.settings");

    const [guildsResult, botInviteResult] = await Promise.allSettled([
      getDiscordGuilds(),
      getDiscordBotInviteUrl(),
    ]);

    const guilds = guildsResult.status === "fulfilled" ? guildsResult.value : [];
    const botInviteUrl = botInviteResult.status === "fulfilled" ? (botInviteResult.value?.url ?? null) : null;

    return Response.json({ guilds, botInviteUrl });
  } catch (error) {
    return errorResponse(error);
  }
});
