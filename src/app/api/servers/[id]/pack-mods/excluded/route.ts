import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

/** POST — add an exclusion rule for a preinstalled pack mod */
export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    if (server.serverType !== "curseforge" && server.serverType !== "modrinth") {
      return Response.json({ error: "Nur für Pack-Server verfügbar" }, { status: 400 });
    }

    const body = await req.json();
    const { displayName, slug, projectId, cfExcludeToken, filenameToken, isOverride } = body;

    if (!displayName) {
      return Response.json({ error: "displayName ist erforderlich" }, { status: 400 });
    }
    if (server.serverType === "curseforge" && !cfExcludeToken) {
      return Response.json({ error: "cfExcludeToken ist für CurseForge-Server erforderlich" }, { status: 400 });
    }
    if (server.serverType === "modrinth" && !filenameToken) {
      return Response.json({ error: "filenameToken ist für Modrinth-Server erforderlich" }, { status: 400 });
    }

    // Duplicate check
    const alreadyExcluded = (server.excludedPackMods ?? []).find((e) => {
      if (server.serverType === "curseforge") return e.cfExcludeToken === cfExcludeToken && !!e.isOverride === !!isOverride;
      return e.filenameToken === filenameToken && !!e.isOverride === !!isOverride;
    });
    if (alreadyExcluded) {
      return Response.json({ error: `"${displayName}" ist bereits ausgeschlossen` }, { status: 409 });
    }

    await connectDB();
    const updated = await ServerModel.findByIdAndUpdate(
      params.id,
      {
        $push: {
          excludedPackMods: {
            displayName,
            slug,
            projectId,
            cfExcludeToken,
            filenameToken,
            isOverride: !!isOverride,
            excludedAt: new Date(),
          },
        },
      },
      { new: true },
    ).lean();

    const added = updated?.excludedPackMods?.at(-1);
    return Response.json(added, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
