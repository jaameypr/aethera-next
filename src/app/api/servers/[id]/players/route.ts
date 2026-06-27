import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
import {
  listPlayers,
  isWhitelistEnabled,
} from "@/lib/services/minecraft-players.service";

/**
 * GET /api/servers/[id]/players
 * Returns the whitelist + ops + the white-list enabled flag.
 */
export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const [players, whitelistEnabled] = await Promise.all([
      listPlayers(params.id),
      isWhitelistEnabled(params.id),
    ]);

    return Response.json({ ...players, whitelistEnabled });
  } catch (error) {
    return errorResponse(error);
  }
});
