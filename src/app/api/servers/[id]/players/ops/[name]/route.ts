import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
import {
  removeOp,
  setOpLevel,
  listPlayers,
  isWhitelistEnabled,
} from "@/lib/services/minecraft-players.service";

/**
 * PATCH /api/servers/[id]/players/ops/[name]  { level }
 * Updates the operator level in place and returns the refreshed list.
 */
export const PATCH = withAuth<{ id: string; name: string }>(
  async (req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      await assertServerPermission(server, session.userId, "server.settings");

      const body = (await req.json()) as { level?: unknown };
      const level = body.level;
      if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 4) {
        throw badRequest("level must be an integer between 1 and 4");
      }

      await setOpLevel(params.id, decodeURIComponent(params.name), level);

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

/**
 * DELETE /api/servers/[id]/players/ops/[name]
 * Revokes operator status and returns the refreshed list.
 */
export const DELETE = withAuth<{ id: string; name: string }>(
  async (_req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      await assertServerPermission(server, session.userId, "server.settings");

      await removeOp(params.id, decodeURIComponent(params.name));

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
