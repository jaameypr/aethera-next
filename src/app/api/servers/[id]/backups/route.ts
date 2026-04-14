import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { listBackups } from "@/lib/services/backup.service";
import { createBackupWithStrategy } from "@/lib/services/backup-strategy.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.backups");

    const backups = await listBackups(params.id);
    return Response.json(backups);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.backups");

    const { components } = await req.json();
    // Returns a pending IBackup (status "in_progress") with jobId set.
    // The backup transitions to "completed" once the worker finishes.
    const backup = await createBackupWithStrategy(params.id, components, session.userId);
    return Response.json(backup, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
});
