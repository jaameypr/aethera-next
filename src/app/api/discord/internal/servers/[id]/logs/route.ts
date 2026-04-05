import type { NextRequest } from "next/server";
import { getServer, fetchLogs } from "@/lib/services/server.service";
import { verifyDiscordModuleApiKey } from "@/lib/services/discord-module.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/discord/internal/servers/[id]/logs?since={epochMs}&lines={n}
 *
 * Internal endpoint polled by the Discord module to fetch recent log lines.
 * Secured by the Discord module's API key (Bearer token).
 */
export async function GET(
  req: NextRequest,
  segmentData: { params: Promise<Record<string, string>> },
) {
  // Verify module API key
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const authorized = await verifyDiscordModuleApiKey(token);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await segmentData.params;
  const serverId = params.id;

  const server = await getServer(serverId);
  if (!server) {
    return Response.json({ error: "Server not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const sinceMs = Number(url.searchParams.get("since")) || 0;
  // Fetch up to 500 lines — enough to cover burst activity between 3-second polls.
  // On extremely high-volume servers some lines may still be missed between polls;
  // a proper cursor approach would require persisting Docker log stream offsets.
  const lines   = Number(url.searchParams.get("lines"))  || 500;

  try {
    const entries = await fetchLogs(serverId, lines);

    // Filter to only lines newer than sinceMs
    const filtered = sinceMs > 0
      ? entries.filter((e) => {
          const ts = e.timestamp ? e.timestamp.getTime() : 0;
          return ts > sinceMs;
        })
      : entries;

    // Return just the message strings
    const messages = filtered.map((e) => e.message ?? "");
    return Response.json(messages);
  } catch {
    // Server may not be running — return empty array silently
    return Response.json([]);
  }
}
