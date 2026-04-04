import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { connectDB } from "@/lib/db/connection";
import { AsyncJobModel } from "@/lib/db/models/async-job";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 500;
const TERMINAL_STATUSES = new Set(["done", "error"]);

export async function GET(
  req: NextRequest,
  segmentData: { params: Promise<Record<string, string>> },
) {
  const token = req.cookies.get("access_token")?.value;
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await verifyAccessToken(token);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await segmentData.params;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueue = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller already closed
        }
      };

      const close = () => {
        try { controller.close(); } catch { /* already closed */ }
      };

      await connectDB();

      // Send initial state immediately
      const initial = await AsyncJobModel.findById(jobId).lean();
      if (!initial) {
        enqueue("error", { error: "Job not found" });
        close();
        return;
      }

      enqueue("update", {
        status: initial.status,
        progress: initial.progress,
        message: initial.message,
        result: initial.result ?? null,
        error: initial.error ?? null,
      });

      if (TERMINAL_STATUSES.has(initial.status)) {
        close();
        return;
      }

      // Poll MongoDB until the job reaches a terminal state or client disconnects
      const interval = setInterval(async () => {
        if (req.signal.aborted) {
          clearInterval(interval);
          close();
          return;
        }

        try {
          const job = await AsyncJobModel.findById(jobId).lean();
          if (!job) {
            clearInterval(interval);
            enqueue("error", { error: "Job not found" });
            close();
            return;
          }

          enqueue("update", {
            status: job.status,
            progress: job.progress,
            message: job.message,
            result: job.result ?? null,
            error: job.error ?? null,
          });

          if (TERMINAL_STATUSES.has(job.status)) {
            clearInterval(interval);
            close();
          }
        } catch (err) {
          clearInterval(interval);
          enqueue("error", { error: err instanceof Error ? err.message : "Poll error" });
          close();
        }
      }, POLL_INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        close();
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
