import type { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { getAuditLog } from "@/lib/services/audit.service";
import type { ProjectLogAction } from "@/lib/db/models/project-log";

/** System-wide audit log feed. Gated on `admin.system`. */
export const GET = withPermission("admin.system", async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get("size")) || 30));
    const projectKey = url.searchParams.get("project") || undefined;
    const serverId = url.searchParams.get("server") || undefined;
    const actor = url.searchParams.get("actor") || undefined;
    const actionsParam = url.searchParams.get("actions");
    const actions = actionsParam
      ? (actionsParam.split(",").filter(Boolean) as ProjectLogAction[])
      : undefined;
    const sort = url.searchParams.get("sort") === "asc" ? "asc" : "desc";

    const result = await getAuditLog({
      page,
      size,
      projectKey,
      serverId,
      actions,
      actor,
      sort,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
