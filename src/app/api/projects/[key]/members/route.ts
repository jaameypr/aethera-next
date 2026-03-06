import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import {
  getProject,
  addMember,
  removeMember,
} from "@/lib/services/project.service";

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const project = await getProject(params.key);
    if (!project) throw notFound("Project not found");
    if (project.owner.toString() !== session.userId) throw forbidden();

    const { userId, role } = await req.json();
    await addMember(params.key, userId, role);
    return Response.json({ success: true }, { status: 201 });
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

      const { userId } = await req.json();
      await removeMember(params.key, userId);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
