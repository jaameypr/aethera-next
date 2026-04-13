import "server-only";

import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { subscribeEvents } from "@pruefertit/docker-orchestrator";

let initialized = false;

const RECONNECT_DELAY_MS = 5_000;

/**
 * Start listening to Docker container events for aethera-managed containers.
 * This is a singleton — calling it multiple times is safe.
 * On error the listener automatically reconnects after a short delay.
 */
export async function startEventListener(): Promise<void> {
  if (initialized) return;
  initialized = true;

  async function connect() {
    try {
      const docker = await getDockerClient();

      const subscription = await subscribeEvents(docker, {
        type: "container",
      });

      subscription.on("container.die", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        await ServerModel.updateOne(
          { containerId },
          {
            status: "error",
            containerStatus: `died (exit ${event.actor.attributes["exitCode"] ?? "?"})`,
          },
        );
      });

      subscription.on("container.stop", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        // Keep containerId — container still exists (just stopped). Only destroy removes it.
        await ServerModel.updateOne(
          { containerId, status: { $ne: "stopped" } },
          {
            status: "stopped",
            containerStatus: undefined,
          },
        );
      });

      subscription.on("container.start", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        await ServerModel.updateOne(
          { containerId },
          {
            status: "running",
            containerStatus: "running",
          },
        );
      });

      subscription.on("container.destroy", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        await ServerModel.updateOne(
          { containerId },
          {
            status: "stopped",
            containerId: undefined,
            containerStatus: undefined,
          },
        );
      });

      subscription.on("container.health_status", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;
        const healthStatus = event.actor.attributes["healthStatus"] ?? "unknown";

        await ServerModel.updateOne(
          { containerId },
          { containerStatus: healthStatus },
        );
      });

      subscription.on("error", () => {
        console.warn("[event-listener] Docker event stream error — reconnecting in", RECONNECT_DELAY_MS, "ms");
        setTimeout(connect, RECONNECT_DELAY_MS);
      });
    } catch (err) {
      console.warn("[event-listener] Failed to connect to Docker events — reconnecting in", RECONNECT_DELAY_MS, "ms", err);
      setTimeout(connect, RECONNECT_DELAY_MS);
    }
  }

  await connect();
}

function isAetheraContainer(attributes: Record<string, string>): boolean {
  return attributes["aethera.type"] !== undefined;
}
