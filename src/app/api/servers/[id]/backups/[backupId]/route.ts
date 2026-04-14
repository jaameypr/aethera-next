import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import {
  describeBackupComponents,
  deleteBackup,
  restoreBackup,
} from "@/lib/services/backup.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.backups");

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
      await assertServerPermission(server, session.userId, "server.backups");

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
    await assertServerPermission(server, session.userId, "server.backups");

    await restoreBackup(params.backupId, params.id);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
