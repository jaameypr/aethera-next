import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getServer } from "@/lib/services/server.service";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { canAccessServer } from "@/lib/services/server-access";
import { getMetrics } from "@pruefertit/docker-orchestrator";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  segmentData: { params: Promise<Record<string, string>> },
) {
  const token = req.cookies.get("access_token")?.value;
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId: string;
  try {
    const payload = await verifyAccessToken(token);
    userId = payload.sub;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await segmentData.params;
  const serverId = params.id;

  const server = await getServer(serverId);
  if (!server) {
    return Response.json({ error: "Server not found" }, { status: 404 });
  }
  if (!(await canAccessServer(server, userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!server.containerId || server.status !== "running") {
    return Response.json({ error: "Server is not running" }, { status: 400 });
  }

  const docker = await getDockerClient();
  const containerId = server.containerId;

  try {
    const metrics = await getMetrics(docker, containerId);
    return Response.json({
      ts: metrics.timestamp.toISOString(),
      cpu: metrics.cpu.percent,
      ramUsed: metrics.memory.usedBytes,
      ramLimit: metrics.memory.limitBytes,
      ramPct: metrics.memory.percent,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get metrics";
    return Response.json({ error: msg }, { status: 500 });
  }
}
