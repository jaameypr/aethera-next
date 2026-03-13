import "server-only";

import os from "node:os";
import { connectDB } from "@/lib/db/connection";
import { ServerModel, type IServer } from "@/lib/db/models/server";
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
  modLoader?: IServer["modLoader"];
  javaArgs?: string;
  env?: Record<string, string>;
  properties?: Record<string, string>;
  autoStart?: boolean;
}

// ---------------------------------------------------------------------------
// RAM-Limit Enforcement
// ---------------------------------------------------------------------------

export class RamQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RamQuotaExceededError";
  }
}

interface RamQuotaInfo {
  limitMb: number;
  usedMb: number;
}

/** Reads the user's configured RAM quota and current usage. Returns null if no quota is set. */
async function readRamQuota(userId: string): Promise<RamQuotaInfo | null> {
  const { UserModel } = await import("@/lib/db/models/user");
  const { RoleModel } = await import("@/lib/db/models/role");

  const user = await UserModel.findById(userId);
  if (!user) return null;

  const roleDocs = await RoleModel.find({ name: { $in: user.roles } }).lean();
  const allPerms = [
    ...roleDocs.flatMap((r: any) => r.permissions || []),
    ...(user.permissions || []),
  ];

  if (allPerms.some((p: any) => p.name === "*" && p.allow !== false)) return null;

  const ramPerm = allPerms.find((p: any) => p.name === "user.ram" && p.allow !== false);
  if (!ramPerm?.value) return null;

  const limitMb = parseInt(String(ramPerm.value), 10);
  if (isNaN(limitMb) || limitMb <= 0) return null;

  const ownedProjects = await ProjectModel.find({ owner: userId }).lean();
  const projectKeys = ownedProjects.map((p: any) => p.key);
  const servers = await ServerModel.find({
    projectKey: { $in: projectKeys },
    status: { $ne: "stopped" },
  }).lean();
  const usedMb = servers.reduce((sum: number, s: any) => sum + (s.memory || 0), 0);

  return { limitMb, usedMb };
}

export async function enforceRamLimit(userId: string, requestedRamMb: number): Promise<void> {
  const quota = await readRamQuota(userId);
  if (!quota) return;

  const { limitMb, usedMb } = quota;
  if (usedMb + requestedRamMb > limitMb) {
    throw new RamQuotaExceededError(
      `RAM-Limit überschritten: ${usedMb} MB belegt + ${requestedRamMb} MB angefordert = ${usedMb + requestedRamMb} MB, erlaubt sind ${limitMb} MB`,
    );
  }
}

export async function getRamQuota(userId: string): Promise<{
  limitMb: number;
  usedMb: number;
  availableMb: number;
}> {
  const quota = await readRamQuota(userId);
  if (!quota) return { limitMb: 0, usedMb: 0, availableMb: 0 };
  const availableMb = Math.max(0, quota.limitMb - quota.usedMb);
  return { ...quota, availableMb };
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

  await enforceRamLimit(actorId, data.memory);

  const server = await ServerModel.create({
    ...data,
    projectKey,
    status: "stopped",
    env: data.env ?? {},
    properties: data.properties ?? {},
    autoStart: data.autoStart ?? false,
    access: [],
  });

  await ensureServerDir(server.identifier);

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
  "modLoader",
  "javaArgs",
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
  if (changesConfig && server.status !== "stopped") {
    throw new Error(
      "Server must be stopped before changing configuration fields",
    );
  }

  const updated = await ServerModel.findByIdAndUpdate(serverId, patch, {
    new: true,
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
    }

    // No container exists — full deploy
    await enforceRamLimit(actorId, server.memory);

    const orch = await getOrchestrator();
    const dataDir = getServerDataPath(server.identifier);
    await ensureServerDir(server.identifier);

    const config = deployConfigFromDoc(server, dataDir);
    const result = await orch.deploy(config);

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
