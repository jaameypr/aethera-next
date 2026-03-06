import type { NextRequest } from "next/server";
import { withAuth, withPermission } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { listProjects, createProject } from "@/lib/services/project.service";

export const GET = withAuth(async (_req: NextRequest, { session }) => {
  try {
    const projects = await listProjects(session.userId);
    return Response.json(projects);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withPermission(
  "project.create",
  async (req: NextRequest, { session }) => {
    try {
      const { name, key } = await req.json();
      const project = await createProject({
        name,
        key,
        owner: session.userId,
      });
      return Response.json(project, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
