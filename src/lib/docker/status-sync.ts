import "server-only";

import { connectDB } from "@/lib/db/connection";
import { ServerModel } from "@/lib/db/models/server";
import { getDockerClient } from "@/lib/docker/orchestrator";
import {
  inspectContainer,
  listContainers,
} from "@pruefertit/docker-orchestrator";

/**
 * Sync a single server's DB status with its actual Docker container state.
 */
export async function syncServerStatus(serverId: string): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) return;

  // Don't override transitional lifecycle states — the background worker owns them
  if (server.status === "starting" || server.status === "stopping") return;

  // No container tracked — nothing to sync
  if (!server.containerId) {
    if (server.status !== "stopped" && server.status !== "error") {
      await ServerModel.findByIdAndUpdate(serverId, { status: "error" });
    }
    return;
  }

  const docker = await getDockerClient();

  try {
    const info = await inspectContainer(docker, server.containerId);

    if (info.state.running && server.status !== "running") {
      await ServerModel.findByIdAndUpdate(serverId, {
        status: "running",
        containerStatus: info.state.status,
      });
    } else if (!info.state.running && server.status === "running") {
      await ServerModel.findByIdAndUpdate(serverId, {
        status: "error",
        containerStatus: `exited (code ${info.state.exitCode})`,
      });
    }
  } catch {
    // Container doesn't exist anymore
    if (server.status !== "stopped") {
      await ServerModel.findByIdAndUpdate(serverId, {
        status: "error",
        containerId: undefined,
        containerStatus: "container not found",
      });
    }
  }
}

/**
 * Sync all non-stopped servers with their actual Docker container state.
 * Also detects orphaned aethera containers that have no matching DB record.
 */
export async function syncAllServerStatuses(): Promise<void> {
  await connectDB();
  const docker = await getDockerClient();

  // 1) Sync DB → Docker: check every non-stopped server
  const activeServers = await ServerModel.find({
    status: { $nin: ["stopped"] },
  });

  const runningContainerIds = new Set<string>();

  for (const server of activeServers) {
    // Don't override transitional lifecycle states — the background worker owns them
    if (server.status === "starting" || server.status === "stopping") continue;

    if (!server.containerId) {
      await ServerModel.findByIdAndUpdate(server._id, { status: "error" });
      continue;
    }

    try {
      const info = await inspectContainer(docker, server.containerId);
      runningContainerIds.add(server.containerId);

      if (info.state.running && server.status !== "running") {
        await ServerModel.findByIdAndUpdate(server._id, {
          status: "running",
          containerStatus: info.state.status,
        });
      } else if (!info.state.running && server.status === "running") {
        await ServerModel.findByIdAndUpdate(server._id, {
          status: "error",
          containerStatus: `exited (code ${info.state.exitCode})`,
        });
      }
    } catch {
      await ServerModel.findByIdAndUpdate(server._id, {
        status: "error",
        containerId: undefined,
        containerStatus: "container not found",
      });
    }
  }

  // 2) Docker → DB: find orphaned aethera containers
  try {
    const containers = await listContainers(docker, true);
    const aetherContainers = containers.filter(
      (c) => c.name.startsWith("aethera-mc-") || c.name.startsWith("aethera-hyt-"),
    );

    for (const container of aetherContainers) {
      if (runningContainerIds.has(container.id)) continue;

      // Find by containerId or by name-based identifier
      const identifier = container.name
        .replace(/^\//, "")
        .replace(/^aethera-(mc|hyt)-/, "");

      const server = await ServerModel.findOne({
        $or: [
          { containerId: container.id },
          { identifier },
        ],
      });

      if (server && server.status === "stopped" && container.state === "running") {
        await ServerModel.findByIdAndUpdate(server._id, {
          status: "running",
          containerId: container.id,
          containerStatus: container.state,
        });
      }
    }
  } catch {
    // Docker may be unavailable — skip orphan recovery
  }
}
