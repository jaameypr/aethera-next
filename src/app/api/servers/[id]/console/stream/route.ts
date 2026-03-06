import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getServer } from "@/lib/services/server.service";
import { getOrchestrator } from "@/lib/docker/orchestrator";
import { canAccessServer } from "@/lib/services/server-access";

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

  const orch = await getOrchestrator();
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

      try {
        const console = await orch.attach.console(containerId, {
          reconnect: true,
          outputBufferSize: 500,
        });

        // Send buffered output as initial batch
        const buffer = console.getBuffer();
        if (buffer.length > 0) {
          const payload = JSON.stringify(
            buffer.map((line) => ({
              stream: line.stream,
              message: line.message,
              timestamp: line.timestamp.toISOString(),
            })),
          );
          enqueue(`event: buffer\ndata: ${payload}\n\n`);
        }

        enqueue(": connected\n\n");

        console.on("output", (line) => {
          const payload = JSON.stringify({
            stream: line.stream,
            message: line.message,
            timestamp: line.timestamp.toISOString(),
          });
          enqueue(`data: ${payload}\n\n`);
        });

        console.on("error", (err) => {
          enqueue(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        });

        console.on("disconnected", () => {
          enqueue(`event: disconnected\ndata: {}\n\n`);
        });

        console.on("reconnecting", (attempt) => {
          enqueue(`event: reconnecting\ndata: ${JSON.stringify({ attempt })}\n\n`);
        });

        console.on("connected", () => {
          enqueue(`event: reconnected\ndata: {}\n\n`);
        });

        // Cleanup on client disconnect
        req.signal.addEventListener("abort", () => {
          console.disconnect();
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to attach console";
        enqueue(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
        controller.close();
      }
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
