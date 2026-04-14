import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { listDatapacks, uploadDatapack } from "@/lib/services/addon.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.files");

    const datapacks = await listDatapacks(params.id);
    return Response.json(datapacks);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.files");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }

    const entry = await uploadDatapack(params.id, file);
    return Response.json(entry, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
