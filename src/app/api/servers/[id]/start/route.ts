import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer, beginStartServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.start");

    const body = (await req.json().catch(() => ({}))) as {
      versionAction?: "update" | "keep";
    };

    await beginStartServer(params.id, session.userId, {
      versionAction: body.versionAction,
    });
    return Response.json({ status: "starting" }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
});
