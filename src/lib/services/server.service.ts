import "server-only";

import os from "node:os";
import { copyFile, unlink } from "node:fs/promises";
import path from "node:path";
import { connectDB } from "@/lib/db/connection";
import { ServerModel, type IServer } from "@/lib/db/models/server";
import { BlueprintModel } from "@/lib/db/models/blueprint";
import { ProjectModel } from "@/lib/db/models/project";
import { logAction } from "@/lib/services/project.service";
import { grantIfAbsent } from "@/lib/services/permission-grant.service";
import {
  getOrchestrator,
  getDockerClient,
} from "@/lib/docker/orchestrator";
import {
  stopContainer,
  startContainer,
} from "@pruefertit/docker-orchestrator";
import { containerName, deployConfigFromDoc } from "@/lib/docker/helpers";
import {
  getServerDataPath,
  ensureServerDir,
} from "@/lib/docker/storage";
import {
  inspectContainer,
  tailLogs,
  checkPortAvailable,
  type LogEntry,
} from "@pruefertit/docker-orchestrator";

import type { ServerType, PackSource } from "@/lib/config/server-types";
import type { IPackReference } from "@/lib/db/models/server";

export type { LogEntry };

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ServerCreateInput {
  name: string;
  identifier: string;
  runtime: "minecraft" | "hytale";
  image: string;
  tag: string;
  port: number;
  rconPort?: number;
  memory: number;
  version?: string;
  /** New canonical type field — replaces modLoader for new servers */
  serverType?: ServerType;
  /** Legacy — still accepted for backward compat */
  modLoader?: IServer["modLoader"];
  /** Pack installation source */
  packSource?: PackSource;
  /** Structured pack reference (slug, projectId, fileId, etc.) */
  packReference?: IPackReference;
  /** MC version resolved from pack metadata */
  resolvedMinecraftVersion?: string;
  /** Loader type resolved from pack */
  resolvedLoader?: string;
  /** Loader version resolved from pack */
  resolvedLoaderVersion?: string;
  javaArgs?: string;
  javaVersion?: string;
  env?: Record<string, string>;
  properties?: Record<string, string>;
  autoStart?: boolean;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listServers(
  projectKey: string,
  userId: string,
): Promise<IServer[]> {
  await connectDB();

  const project = await ProjectModel.findOne({ key: projectKey }).lean();
  if (!project) return [];

  const isOwner = project.owner.toString() === userId;
  const isMember = project.members.some(
    (m) => m.userId.toString() === userId,
  );
  if (!isOwner && !isMember) return [];

  return ServerModel.find({ projectKey }).sort({ name: 1 }).lean<IServer[]>();
}

export async function getServer(serverId: string): Promise<IServer | null> {
  await connectDB();
  return ServerModel.findById(serverId).lean<IServer>();
}

export async function createServer(
  projectKey: string,
  data: ServerCreateInput,
  actorId: string,
): Promise<IServer> {
  await connectDB();

  const server = await ServerModel.create({
    ...data,
    projectKey,
    status: "stopped",
    env: data.env ?? {},
    properties: data.properties ?? {},
    autoStart: data.autoStart ?? false,
    access: [],
  });

  await ensureServerDir(server.projectKey, server.identifier);

  // If an .mrpack was uploaded via the wizard, move it into /data so the
  // itzg image can find it at MODRINTH_MODPACK=/data/pack.mrpack
  if (data.packReference?.mrpackUploadId) {
    try {
      const { getMrpackPackPath } = await import("@/app/api/servers/mrpack/process/route");
      const src = getMrpackPackPath(data.packReference.mrpackUploadId);
      const dest = path.join(getServerDataPath(server.projectKey, server.identifier), "pack.mrpack");
      await copyFile(src, dest);
      unlink(src).catch(() => {});
    } catch (err) {
      console.warn("[createServer] Could not copy .mrpack file:", err);
    }
  }

  await logAction(projectKey, "SERVER_CREATED", actorId, {
    serverId: server._id.toString(),
    name: data.name,
    identifier: data.identifier,
  });

  // --- Auto-Permissions für den Ersteller ---
  await grantIfAbsent(actorId, `server.read:${server._id.toString()}`);
  await grantIfAbsent(actorId, `server.write:${server._id.toString()}`);

  return server.toObject() as IServer;
}

const CONFIG_FIELDS = new Set([
  "image",
  "tag",
  "port",
  "rconPort",
  "memory",
  "version",
  "serverType",
  "modLoader",
  "packSource",
  "packReference",
  "resolvedMinecraftVersion",
  "resolvedLoader",
  "resolvedLoaderVersion",
  "javaArgs",
  "javaVersion",
  "env",
  "properties",
]);

export async function updateServer(
  serverId: string,
  patch: Partial<IServer>,
): Promise<IServer> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");

  const changesConfig = Object.keys(patch).some((k) => CONFIG_FIELDS.has(k));
  if (changesConfig && server.status !== "stopped" && server.status !== "error") {
    throw new Error(
      "Server must be stopped before changing configuration fields",
    );
  }

  const updated = await ServerModel.findByIdAndUpdate(serverId, patch, {
    returnDocument: "after",
  }).lean<IServer>();
  if (!updated) throw new Error("Server not found");

  return updated;
}

export async function deleteServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");

  if (server.containerId && server.status !== "stopped") {
    const orch = await getOrchestrator();
    try {
      await orch.destroy(server.containerId, { force: true, removeVolumes: false });
    } catch {
      // container may already be gone
    }
  }

  await logAction(server.projectKey, "SERVER_DELETED", actorId, {
    serverId: server._id.toString(),
    name: server.name,
    identifier: server.identifier,
  });

  await ServerModel.findByIdAndDelete(serverId);

  // Release any blueprint that was linked to this server
  await BlueprintModel.updateOne(
    { serverId: server._id, status: "claimed" },
    { $set: { status: "available" }, $unset: { serverId: "" } },
  );
}

// ---------------------------------------------------------------------------
// LIFECYCLE
// ---------------------------------------------------------------------------

export async function startServer(
  serverId: string,
  actorId: string,
): Promise<{ containerId: string }> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status === "running" || server.status === "starting") {
    throw new Error(`Server is already ${server.status}`);
  }

  await ServerModel.findByIdAndUpdate(serverId, { status: "starting" });

  try {
    // If a stopped container already exists, just start it
    if (server.containerId) {
      const docker = await getDockerClient();
      try {
        await startContainer(docker, server.containerId);

        await ServerModel.findByIdAndUpdate(serverId, {
          status: "running",
          containerStatus: "running",
        });

        await logAction(server.projectKey, "SERVER_STARTED", actorId, {
          serverId: server._id.toString(),
          containerId: server.containerId,
        });

        return { containerId: server.containerId };
      } catch (containerErr: any) {
        const statusCode =
          containerErr?.statusCode ?? containerErr?.cause?.statusCode ?? 0;
        if (statusCode === 404) {
          // Container was removed externally — clear stale ref and fall through to full deploy
          console.log(
            `[server] Container ${server.containerId} no longer exists, redeploying`,
          );
          await ServerModel.findByIdAndUpdate(serverId, {
            containerId: null,
          });
        } else {
          throw containerErr;
        }
      }
    }

    // No container exists — full deploy
    const orch = await getOrchestrator();
    const dataDir = getServerDataPath(server.projectKey, server.identifier);
    await ensureServerDir(server.projectKey, server.identifier);

    const config = deployConfigFromDoc(server, dataDir);

    let result;
    try {
      result = await orch.deploy(config);
    } catch (deployErr: any) {
      // Handle stale container conflict — remove old container and retry
      const msg = deployErr?.cause?.json?.message ?? deployErr?.message ?? "";
      if (msg.includes("is already in use")) {
        console.log(`[server] Removing stale container ${config.name} and retrying deploy`);
        const docker = await getDockerClient();
        try {
          const old = docker.getContainer(config.name);
          await old.remove({ force: true });
        } catch {
          // container might already be gone
        }
        result = await orch.deploy(config);
      } else {
        throw deployErr;
      }
    }

    await ServerModel.findByIdAndUpdate(serverId, {
      containerId: result.containerId,
      containerStatus: result.status,
      status: "running",
    });

    await logAction(server.projectKey, "SERVER_STARTED", actorId, {
      serverId: server._id.toString(),
      containerId: result.containerId,
    });

    return { containerId: result.containerId };
  } catch (err) {
    await ServerModel.findByIdAndUpdate(serverId, {
      status: "error",
      containerStatus: err instanceof Error ? err.message : "deploy failed",
    });
    throw err;
  }
}

/**
 * Soft-stop: stop the container but keep it (can be restarted quickly).
 */
export async function softStopServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (!server.containerId) throw new Error("Server has no container");

  await ServerModel.findByIdAndUpdate(serverId, { status: "stopping" });

  try {
    const docker = await getDockerClient();
    await stopContainer(docker, server.containerId, 30);

    await ServerModel.findByIdAndUpdate(serverId, {
      status: "stopped",
      containerStatus: "exited",
    });

    await logAction(server.projectKey, "SERVER_STOPPED", actorId, {
      serverId: server._id.toString(),
    });
  } catch (err) {
    await ServerModel.findByIdAndUpdate(serverId, {
      status: "error",
      containerStatus: err instanceof Error ? err.message : "stop failed",
    });
    throw err;
  }
}

/**
 * Hard-stop: stop and remove the container entirely.
 */
export async function stopServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (!server.containerId) throw new Error("Server has no container");

  await ServerModel.findByIdAndUpdate(serverId, { status: "stopping" });

  try {
    const orch = await getOrchestrator();
    await orch.destroy(server.containerId, { timeout: 30 });

    await ServerModel.findByIdAndUpdate(serverId, {
      status: "stopped",
      containerId: undefined,
      containerStatus: undefined,
    });

    await logAction(server.projectKey, "SERVER_STOPPED", actorId, {
      serverId: server._id.toString(),
    });
  } catch (err) {
    await ServerModel.findByIdAndUpdate(serverId, {
      status: "error",
      containerStatus: err instanceof Error ? err.message : "stop failed",
    });
    throw err;
  }
}

export async function recreateServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");

  if (
    server.containerId &&
    server.status !== "stopped"
  ) {
    await stopServer(serverId, actorId);
  }

  await startServer(serverId, actorId);
}

export async function getServerStatus(
  serverId: string,
): Promise<{
  status: IServer["status"];
  containerStatus?: string;
  uptime?: number;
}> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");

  if (!server.containerId) {
    return { status: server.status };
  }

  try {
    const docker = await getDockerClient();
    const info = await inspectContainer(docker, server.containerId);

    const dbStatus = info.state.running ? "running" : "stopped";
    if (server.status !== dbStatus) {
      await ServerModel.findByIdAndUpdate(serverId, {
        status: dbStatus,
        containerStatus: info.state.status,
      });
    }

    const uptime = info.state.running
      ? Date.now() - new Date(info.state.startedAt).getTime()
      : undefined;

    return {
      status: dbStatus,
      containerStatus: info.state.status,
      uptime,
    };
  } catch {
    // Container gone — sync DB
    await ServerModel.findByIdAndUpdate(serverId, {
      status: "stopped",
      containerId: undefined,
      containerStatus: undefined,
    });
    return { status: "stopped" };
  }
}

// ---------------------------------------------------------------------------
// ADVANCED
// ---------------------------------------------------------------------------

export async function fetchLogs(
  serverId: string,
  lines?: number,
): Promise<LogEntry[]> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (!server.containerId) return [];

  const docker = await getDockerClient();
  return tailLogs(docker, server.containerId, lines ?? 200);
}

export async function sendConsoleCommand(
  serverId: string,
  command: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (!server.containerId || server.status !== "running") {
    throw new Error("Server is not running");
  }

  const orch = await getOrchestrator();
  await orch.attach.send(server.containerId, command);
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return checkPortAvailable(port);
}

export async function getRamRemaining(): Promise<{
  total: number;
  used: number;
  available: number;
}> {
  const total = os.totalmem();
  const free = os.freemem();
  return { total, used: total - free, available: free };
}
