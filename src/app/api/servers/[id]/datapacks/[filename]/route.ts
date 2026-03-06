import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound, badRequest } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import {
  deleteDatapack,
  activateDatapack,
  deactivateDatapack,
} from "@/lib/services/addon.service";
import { canAccessServer } from "@/lib/services/server-access";

export const DELETE = withAuth(
  async (_req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      if (!(await canAccessServer(server, session.userId))) throw forbidden();

      await deleteDatapack(params.id, params.filename);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

export const PATCH = withAuth(
  async (req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      if (!(await canAccessServer(server, session.userId))) throw forbidden();

      const { enabled } = await req.json();
      if (typeof enabled !== "boolean") throw badRequest("enabled must be a boolean");

      if (enabled) {
        await activateDatapack(params.id, params.filename);
      } else {
        await deactivateDatapack(params.id, params.filename);
      }

      return Response.json({ success: true });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
