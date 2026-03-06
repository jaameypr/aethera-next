import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { subscribeEvents } from "@pruefertit/docker-orchestrator";

let initialized = false;

/**
 * Start listening to Docker container events for aethera-managed containers.
 * This is a singleton — calling it multiple times is safe.
 */
export async function startEventListener(): Promise<void> {
  if (initialized) return;
  initialized = true;

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

      // Only mark stopped if the DB still references this container
      await ServerModel.updateOne(
        { containerId, status: { $ne: "stopped" } },
        {
          status: "stopped",
          containerId: undefined,
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
      // Reset so a future call can re-initialize
      initialized = false;
    });
  } catch {
    initialized = false;
  }
}

function isAetheraContainer(attributes: Record<string, string>): boolean {
  return attributes["aethera.type"] !== undefined;
}
