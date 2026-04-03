import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import {
  readFile,
  writeFile,
  deleteFile,
  uploadFile,
  downloadFile,
  downloadFolderAsZip,
  moveFile,
} from "@/lib/services/file.service";
import { canAccessServer } from "@/lib/services/server-access";

function extractFilepath(params: { path: string[] }): string {
  return params.path.join("/");
}

export const GET = withAuth<{ id: string; path: string[] }>(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const filepath = extractFilepath(params);
    const url = new URL(req.url);

    if (url.searchParams.get("download") === "true") {
      // Try file first, fall back to folder zip
      try {
        const { stream, filename, size } = await downloadFile(params.id, filepath);
        return new Response(stream, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            "Content-Length": String(size),
          },
        });
      } catch {
        const { stream, filename } = await downloadFolderAsZip(params.id, filepath);
        return new Response(stream, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          },
        });
      }
    }

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

export const PATCH = withAuth<{ id: string; path: string[] }>(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    const fromPath = extractFilepath(params);
    const { to } = await req.json();
    if (!to || typeof to !== "string") {
      return Response.json({ error: '"to" is required' }, { status: 400 });
    }

    await moveFile(params.id, fromPath, to);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});

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
