import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { getFileTree } from "@/lib/services/file.service";
import { canAccessServer } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const tree = await getFileTree(params.id);
    return Response.json(tree);
  } catch (error) {
    return errorResponse(error);
  }
});
