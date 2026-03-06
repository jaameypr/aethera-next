import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import {
  describeBackupComponents,
  deleteBackup,
  restoreBackup,
} from "@/lib/services/backup.service";
import { canAccessServer } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const description = await describeBackupComponents(params.backupId);
    return Response.json(description);
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(
  async (_req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      if (!(await canAccessServer(server, session.userId))) throw forbidden();

      await deleteBackup(params.backupId);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

export const POST = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    await restoreBackup(params.backupId, params.id);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
