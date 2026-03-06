import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer, sendConsoleCommand } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const { command } = await req.json();
    if (!command || typeof command !== "string") {
      return Response.json({ error: "command is required" }, { status: 400 });
    }

    await sendConsoleCommand(params.id, command);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
