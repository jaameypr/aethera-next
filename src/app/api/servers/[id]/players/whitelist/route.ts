import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
import {
  addWhitelist,
  setWhitelistEnabled,
  listPlayers,
  isWhitelistEnabled,
} from "@/lib/services/minecraft-players.service";

/**
 * POST /api/servers/[id]/players/whitelist  { name }
 * Adds a player to the whitelist and returns the refreshed list.
 */
export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const { name } = (await req.json()) as { name?: string };
    if (!name) throw badRequest("name is required");

    await addWhitelist(params.id, name);

    const [players, whitelistEnabled] = await Promise.all([
      listPlayers(params.id),
      isWhitelistEnabled(params.id),
    ]);
    return Response.json({ ...players, whitelistEnabled });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * PATCH /api/servers/[id]/players/whitelist  { enabled }
 * Toggles whitelist enforcement (white-list).
 */
export const PATCH = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const { enabled } = (await req.json()) as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      throw badRequest("enabled (boolean) is required");
    }

    await setWhitelistEnabled(params.id, enabled);

    const whitelistEnabled = await isWhitelistEnabled(params.id);
    return Response.json({ whitelistEnabled });
  } catch (error) {
    return errorResponse(error);
  }
});
