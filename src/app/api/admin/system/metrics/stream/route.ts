import type { NextRequest } from "next/server";
import * as si from "systeminformation";
import { withPermission } from "@/lib/auth/guards";
import { connectDB } from "@/lib/db/connection";
import { SystemMetricModel } from "@/lib/db/models/system-metric";

export const dynamic = "force-dynamic";

// Interval between SSE frames (ms)
const INTERVAL_MS = 3_000;
// Write a DB snapshot every N ticks (N * INTERVAL_MS = 60 s)
const SNAPSHOT_EVERY = 20;

export const GET = withPermission("admin.system", async (req: NextRequest) => {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let snapshotTick = 0;

      const enqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // controller closed
        }
      };

      enqueue(": connected\n\n");

      const tick = async () => {
        try {
          const [cpuLoad, memInfo] = await Promise.all([
            si.currentLoad(),
            si.mem(),
          ]);

          const cpuPct = Math.round(cpuLoad.currentLoad * 10) / 10;
          const ramUsedMb = Math.round(memInfo.used / 1024 / 1024);
          const ramTotalMb = Math.round(memInfo.total / 1024 / 1024);
          const ramPct =
            memInfo.total > 0
              ? Math.round((memInfo.used / memInfo.total) * 1000) / 10
              : 0;

          const frame = { ts: new Date().toISOString(), cpuPct, ramUsedMb, ramTotalMb, ramPct };
          enqueue(`data: ${JSON.stringify(frame)}\n\n`);

          // Persist a snapshot to MongoDB every 60 s
          snapshotTick++;
          if (snapshotTick >= SNAPSHOT_EVERY) {
            snapshotTick = 0;
            connectDB()
              .then(() => SystemMetricModel.create({ ts: new Date(), cpuPct, ramPct }))
              .catch(() => {
                // non-fatal — don't interrupt the stream
              });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Metrics error";
          enqueue(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
        }
      };

      // First sample immediately, then on the interval
      await tick();
      const intervalId = setInterval(tick, INTERVAL_MS);

      req.signal.addEventListener("abort", () => {
        clearInterval(intervalId);
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
});
