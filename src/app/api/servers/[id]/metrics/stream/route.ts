import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getServer } from "@/lib/services/server.service";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { canAccessServer } from "@/lib/services/server-access";
import { streamMetrics, type ContainerMetrics } from "@pruefertit/docker-orchestrator";

export const dynamic = "force-dynamic";

const BUFFER_MAX = 60;

type MetricsFrame = {
  ts: string;
  cpu: number;
  ramUsed: number;
  ramLimit: number;
  ramPct: number;
};

// Rolling buffer of the last 60 data points, keyed by containerId
const metricsBuffers = new Map<string, MetricsFrame[]>();

function buildFrame(metrics: ContainerMetrics): MetricsFrame {
  return {
    ts: metrics.timestamp.toISOString(),
    cpu: metrics.cpu.percent,
    ramUsed: metrics.memory.usedBytes,
    ramLimit: metrics.memory.limitBytes,
    ramPct: metrics.memory.percent,
  };
}

function pushToBuffer(containerId: string, frame: MetricsFrame): void {
  const buf = metricsBuffers.get(containerId) ?? [];
  buf.push(frame);
  if (buf.length > BUFFER_MAX) buf.splice(0, buf.length - BUFFER_MAX);
  metricsBuffers.set(containerId, buf);
}

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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // controller may be closed
        }
      };

      // Send buffered history to new clients
      const history = metricsBuffers.get(containerId) ?? [];
      for (const frame of history) {
        enqueue(`data: ${JSON.stringify(frame)}\n\n`);
      }

      enqueue(": connected\n\n");

      let metricsStream: Awaited<ReturnType<typeof streamMetrics>> | null = null;

      try {
        metricsStream = await streamMetrics(docker, containerId, 2000);

        metricsStream.on("data", (metrics) => {
          const frame = buildFrame(metrics);
          pushToBuffer(containerId, frame);
          enqueue(`data: ${JSON.stringify(frame)}\n\n`);
        });

        metricsStream.on("error", (err) => {
          enqueue(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
          controller.close();
        });

        metricsStream.on("end", () => {
          enqueue("event: end\ndata: {}\n\n");
          controller.close();
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to stream metrics";
        enqueue(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
        controller.close();
      }

      req.signal.addEventListener("abort", () => {
        metricsStream?.stop();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
