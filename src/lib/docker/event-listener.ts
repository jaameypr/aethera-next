import "server-only";

import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { subscribeEvents } from "@pruefertit/docker-orchestrator";
import { sendServerEventToDiscordModule } from "@/lib/services/discord-module.service";

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
        const exitCode = event.actor.attributes["exitCode"];

        // Only mark as error if not already in an intentional stop state.
        // container.die can arrive *after* container.stop on clean shutdowns,
        // so we must not overwrite "stopped"/"stopping" with "error".
        const oldDoc = await ServerModel.findOneAndUpdate(
          { containerId, status: { $nin: ["stopped", "stopping"] } },
          {
            status: "error",
            containerStatus: `died (exit ${exitCode ?? "?"})`,
          },
          { returnDocument: "before" },
        );

        // Only notify as a crash if the server was not already being stopped intentionally
        if (oldDoc && oldDoc.status !== "stopping") {
          sendServerEventToDiscordModule(
            oldDoc._id.toString(),
            "SERVER_ERROR",
            oldDoc.name,
            `Server crashed (exit code: ${exitCode ?? "?"})`,
          ).catch((e) => console.warn("[event-listener] Discord notify failed:", e));
        }
      });

      subscription.on("container.stop", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        // Keep containerId — container still exists (just stopped). Only destroy removes it.
        const newDoc = await ServerModel.findOneAndUpdate(
          { containerId, status: { $ne: "stopped" } },
          {
            status: "stopped",
            containerStatus: undefined,
          },
          { returnDocument: "after" },
        );

        // Only notify if the update was actually applied (i.e. server wasn't already stopped)
        if (newDoc) {
          sendServerEventToDiscordModule(
            newDoc._id.toString(),
            "SERVER_STOPPED",
            newDoc.name,
            "Server has been stopped.",
          ).catch((e) => console.warn("[event-listener] Discord notify failed:", e));
        }
      });

      subscription.on("container.start", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        const newDoc = await ServerModel.findOneAndUpdate(
          { containerId },
          {
            status: "running",
            containerStatus: "running",
          },
          { returnDocument: "after" },
        );

        if (newDoc) {
          sendServerEventToDiscordModule(
            newDoc._id.toString(),
            "SERVER_STARTED",
            newDoc.name,
            "Server is now online.",
          ).catch((e) => console.warn("[event-listener] Discord notify failed:", e));
        }
      });

      subscription.on("container.destroy", async (event) => {
        if (!isAetheraContainer(event.actor.attributes)) return;

        await connectDB();
        const containerId = event.actor.id;

        // container.stop fires before destroy for graceful shutdowns and already sends
        // SERVER_STOPPED; skip notification here to avoid duplicates.
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
