import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import {
  readFile,
  writeFile,
  deleteFile,
  uploadFile,
} from "@/lib/services/file.service";
import { canAccessServer } from "@/lib/services/server-access";

function extractFilepath(params: { path: string[] }): string {
  return params.path.join("/");
}

export const GET = withAuth<{ id: string; path: string[] }>(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const filepath = extractFilepath(params);
    const result = await readFile(params.id, filepath);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

export const PUT = withAuth<{ id: string; path: string[] }>(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const filepath = extractFilepath(params);
    const { content } = await req.json();
    await writeFile(params.id, filepath, content);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth<{ id: string; path: string[] }>(
  async (_req: NextRequest, { session, params }) => {
    try {
      const server = await getServer(params.id);
      if (!server) throw notFound("Server not found");
      if (!(await canAccessServer(server, session.userId))) throw forbidden();

      const filepath = extractFilepath(params);
      await deleteFile(params.id, filepath);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);

export const POST = withAuth<{ id: string; path: string[] }>(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const filepath = extractFilepath(params);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }

    await uploadFile(params.id, filepath, file);
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
