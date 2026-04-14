import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { getServer } from "@/lib/services/server.service";
import { listPlugins, uploadPlugin } from "@/lib/services/addon.service";
import { assertServerPermission } from "@/lib/services/server-access";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.files");

    const plugins = await listPlugins(params.id);
    return Response.json(plugins);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    await assertServerPermission(server, session.userId, "server.files");

    if (!["paper", "spigot", "purpur"].includes(server.modLoader ?? "")) {
      return Response.json(
        { error: "Plugins sind nur für Paper/Spigot/Purpur-Server verfügbar" },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return Response.json({ error: "file is required" }, { status: 400 });
    }

    const entry = await uploadPlugin(params.id, file);
    return Response.json(entry, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
