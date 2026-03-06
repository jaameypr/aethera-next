import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getServer } from "@/lib/services/server.service";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { canAccessServer } from "@/lib/services/server-access";
import { streamLogs } from "@pruefertit/docker-orchestrator";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  segmentData: { params: Promise<Record<string, string>> },
) {
  // Auth
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

  // Access check
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

      // Initial keep-alive
      enqueue(": connected\n\n");

      let logStream: Awaited<ReturnType<typeof streamLogs>> | null = null;

      try {
        logStream = await streamLogs(docker, containerId);

        logStream.on("data", (entry) => {
          const payload = JSON.stringify({
            stream: entry.stream,
            message: entry.message,
            timestamp: entry.timestamp?.toISOString() ?? new Date().toISOString(),
          });
          enqueue(`data: ${payload}\n\n`);
        });

        logStream.on("error", (err) => {
          enqueue(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
          controller.close();
        });

        logStream.on("end", () => {
          enqueue("event: end\ndata: {}\n\n");
          controller.close();
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to stream logs";
        enqueue(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
        controller.close();
      }

      // Cleanup when client disconnects
      req.signal.addEventListener("abort", () => {
        logStream?.stop();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
