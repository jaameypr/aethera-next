import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, badRequest, notFound, forbidden } from "@/lib/api/errors";
import { restoreBackupSelective } from "@/lib/services/backup.service";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";
import type { BackupComponent } from "@/lib/db/models/backup";

const VALID_COMPONENTS: BackupComponent[] = [
  "world",
  "config",
  "mods",
  "plugins",
  "datapacks",
];

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const { backupId, serverId } = params;

    const server = await getServer(serverId);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const body = await req.json();
    const components: BackupComponent[] = body.components;

    if (!Array.isArray(components) || components.length === 0) {
      throw badRequest("components must be a non-empty array");
    }

    for (const c of components) {
      if (!VALID_COMPONENTS.includes(c)) {
        throw badRequest(`Invalid component: ${c}`);
      }
    }

    await restoreBackupSelective(backupId, serverId, components);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
