import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
import {
  removeWhitelist,
  listPlayers,
  isWhitelistEnabled,
} from "@/lib/services/minecraft-players.service";

/**
 * DELETE /api/servers/[id]/players/whitelist/[name]
 * Removes a player from the whitelist and returns the refreshed list.
 */
export const DELETE = withAuth<{ id: string; name: string }>(
  async (_req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      await assertServerPermission(server, session.userId, "server.settings");

      await removeWhitelist(params.id, decodeURIComponent(params.name));

      const [players, whitelistEnabled] = await Promise.all([
        listPlayers(params.id),
        isWhitelistEnabled(params.id),
      ]);
      return Response.json({ ...players, whitelistEnabled });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
