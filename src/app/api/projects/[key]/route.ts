import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import {
  getProject,
  renameProject,
  deleteProject,
} from "@/lib/services/project.service";

function hasAccess(
  project: { owner: { toString(): string }; members: { userId: { toString(): string } }[] },
  userId: string,
): boolean {
  return (
    project.owner.toString() === userId ||
    project.members.some((m) => m.userId.toString() === userId)
  );
}

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const project = await getProject(params.key);
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    if (!hasAccess(project, session.userId)) throw forbidden();

    return Response.json(project);
  } catch (error) {
    return errorResponse(error);
  }
});

export const PATCH = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const project = await getProject(params.key);
    if (!project) throw notFound("Project not found");
    if (!hasAccess(project, session.userId)) throw forbidden();

    const { name } = await req.json();
    const updated = await renameProject(params.key, name);
    return Response.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(
  async (req: NextRequest, { session, params }) => {
    try {
      const project = await getProject(params.key);
      if (!project) throw notFound("Project not found");
      if (project.owner.toString() !== session.userId) throw forbidden();

      const { confirmationName } = await req.json();
      await deleteProject(params.key, confirmationName);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
