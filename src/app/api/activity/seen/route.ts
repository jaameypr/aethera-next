import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { badRequest, errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getProject } from "@/lib/services/project.service";
import { markSeen } from "@/lib/services/activity.service";

export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const body = (await req.json().catch(() => ({}))) as { projectKey?: string };
    const projectKey = body.projectKey;
    if (!projectKey) throw badRequest("projectKey is required");

    const project = await getProject(projectKey);
    if (!project) throw notFound("Project not found");

    const isOwner = project.owner.toString() === session.userId;
    const isMember = project.members.some(
      (m) => m.userId.toString() === session.userId,
    );
    if (!isOwner && !isMember) throw forbidden();

    await markSeen(session.userId, projectKey);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
});
