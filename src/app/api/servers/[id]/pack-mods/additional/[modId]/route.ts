import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

/** DELETE — remove an additional mod by its _id */
export const DELETE = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    await connectDB();
    await ServerModel.findByIdAndUpdate(params.id, {
      $pull: { additionalMods: { _id: params.modId } },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
});
