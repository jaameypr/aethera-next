import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getProject, getProjectLogs } from "@/lib/services/project.service";
import type { ProjectLogAction } from "@/lib/db/models/project-log";

export const GET = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const project = await getProject(params.key);
    if (!project) throw notFound("Project not found");

    const isOwner = project.owner.toString() === session.userId;
    const isMember = project.members.some(
      (m) => m.userId.toString() === session.userId,
    );
    if (!isOwner && !isMember) throw forbidden();

    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get("size")) || 25));
    const excludeParam = url.searchParams.get("exclude");
    const excludeActions = excludeParam
      ? (excludeParam.split(",") as ProjectLogAction[])
      : undefined;

    const result = await getProjectLogs(params.key, {
      page,
      size,
      excludeActions,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});
