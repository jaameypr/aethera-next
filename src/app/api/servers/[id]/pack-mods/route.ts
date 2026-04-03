import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer } from "@/lib/services/server-access";

/** GET — return additionalMods + excludedPackMods */
export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    if (server.serverType !== "curseforge" && server.serverType !== "modrinth") {
      return Response.json({ error: "Nur für Pack-Server verfügbar" }, { status: 400 });
    }

    return Response.json({
      additionalMods: server.additionalMods ?? [],
      excludedPackMods: server.excludedPackMods ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST — add an additional mod (with duplicate check) */
export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    const server = await getServer(params.id);
    if (!server) throw notFound("Server not found");
    if (!(await canAccessServer(server, session.userId))) throw forbidden();

    if (server.serverType !== "curseforge" && server.serverType !== "modrinth") {
      return Response.json({ error: "Nur für Pack-Server verfügbar" }, { status: 400 });
    }

    const body = await req.json();
    const { source, projectId, slug, displayName, versionId, fileId } = body;

    if (!source || !projectId || !displayName) {
      return Response.json({ error: "source, projectId und displayName sind erforderlich" }, { status: 400 });
    }
    if (source !== "modrinth" && source !== "curseforge") {
      return Response.json({ error: "Ungültige Quelle" }, { status: 400 });
    }

    // Duplicate check
    const existing = (server.additionalMods ?? []).find(
      (m) => m.source === source && m.projectId === projectId,
    );
    if (existing) {
      return Response.json({ error: `"${displayName}" ist bereits als zusätzlicher Mod konfiguriert` }, { status: 409 });
    }

    // Prevent adding a mod that is in the exclusion list
    const excluded = (server.excludedPackMods ?? []).find(
      (e) => e.projectId === projectId || e.slug === slug,
    );
    if (excluded) {
      return Response.json(
        { error: `"${displayName}" ist als ausgeschlossener Pack-Mod konfiguriert. Entferne zuerst den Ausschluss.` },
        { status: 409 },
      );
    }

    await connectDB();
    const updated = await ServerModel.findByIdAndUpdate(
      params.id,
      {
        $push: {
          additionalMods: { source, projectId, slug, displayName, versionId, fileId, addedAt: new Date() },
        },
      },
      { new: true },
    ).lean();

    const added = updated?.additionalMods?.at(-1);
    return Response.json(added, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
