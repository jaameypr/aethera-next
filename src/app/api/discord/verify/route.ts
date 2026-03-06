import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import {
  generateVerificationCode,
  unlinkDiscord,
} from "@/lib/services/discord.service";
import { getProject } from "@/lib/services/project.service";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";

export const POST = withAuth(async (req, { session }) => {
  try {
    const { projectKey } = await req.json();
    if (!projectKey) {
      return NextResponse.json(
        { error: "projectKey is required" },
        { status: 400 },
      );
    }

    const project = await getProject(projectKey);
    if (!project) throw notFound("Project not found");

    const isOwner = String(project.owner) === session.userId;
    const isAdmin = project.members.some(
      (m) => String(m.userId) === session.userId && m.role === "admin",
    );
    if (!isOwner && !isAdmin) throw forbidden();

    const result = await generateVerificationCode(projectKey);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
});

export const DELETE = withAuth(async (req, { session }) => {
  try {
    const { projectKey } = await req.json();
    if (!projectKey) {
      return NextResponse.json(
        { error: "projectKey is required" },
        { status: 400 },
      );
    }

    const project = await getProject(projectKey);
    if (!project) throw notFound("Project not found");

    const isOwner = String(project.owner) === session.userId;
    if (!isOwner) throw forbidden();

    await unlinkDiscord(projectKey);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
});
