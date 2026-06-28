import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";
import {
  addOp,
  listPlayers,
  isWhitelistEnabled,
} from "@/lib/services/minecraft-players.service";

/**
 * POST /api/servers/[id]/players/ops  { name, level? }
 * Grants operator status and returns the refreshed list.
 */
export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.settings");

    const { name, level } = (await req.json()) as {
      name?: string;
      level?: number;
    };
    if (!name) throw badRequest("name is required");
    if (level != null && (typeof level !== "number" || level < 1 || level > 4)) {
      throw badRequest("level must be a number between 1 and 4");
    }

    await addOp(params.id, name, level ?? 4);

    const [players, whitelistEnabled] = await Promise.all([
      listPlayers(params.id),
      isWhitelistEnabled(params.id),
    ]);
    return Response.json({ ...players, whitelistEnabled });
  } catch (error) {
    return errorResponse(error);
  }
});
