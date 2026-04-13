import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer, beginRecreateServer } from "@/lib/services/server.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const POST = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.start");

    await beginRecreateServer(params.id, session.userId);
    return Response.json({ status: "stopping" }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
});
