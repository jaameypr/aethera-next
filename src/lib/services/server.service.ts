import "server-only";

import os from "node:os";
import { copyFile, unlink } from "node:fs/promises";
import path from "node:path";
import { connectDB } from "@/lib/db/connection";
import { ServerModel, type IServer } from "@/lib/db/models/server";
import { BlueprintModel } from "@/lib/db/models/blueprint";
import { ProjectModel } from "@/lib/db/models/project";
import { BackupModel } from "@/lib/db/models/backup";
import {
  logAction,
  ROLE_SERVER_PERMISSIONS,
  type ProjectMemberRole,
} from "@/lib/services/project.service";
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

import { HIGHEST_JAVA_VERSION } from "@/lib/utils/java-version";
import {
  getLatestRelease,
  versionTracksLatest,
  isUpdateAvailable,
} from "@/lib/services/minecraft-version.service";
import { VersionUpdateAvailableError } from "@/lib/api/errors";
import { createBackupWithStrategy } from "@/lib/services/backup-strategy.service";

export type { LogEntry };

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ServerCreateInput {
  name: string;
  identifier: string;
  runtime: "minecraft";
  image: string;
  tag: string;
  port: number;
  rconPort?: number;
  memory: number;
  /** CPU cores to allocate to the container (e.g. 2.0). Maps to Docker nanoCpus. */
  cpus?: number;
  /** RAM cap in MB — enforced on subsequent updateServer calls (copied from blueprint). */
  maxRamMb?: number;
  /** CPU cap — enforced on subsequent updateServer calls (copied from blueprint). */
  maxCpus?: number;
  /** Backup storage quota in GB (copied from blueprint on claim). */
  maxBackupStorageGb?: number;
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
  dataInput: ServerCreateInput,
  actorId: string,
): Promise<IServer> {
  await connectDB();

  let data = dataInput;

  // "latest" is a sentinel: resolve it to a concrete release here (the single
  // resolution point). The wizard only ever sends version: "latest".
  if (data.version === "latest") {
    const latest = await getLatestRelease();
    data = {
      ...data,
      resolvedMinecraftVersion: latest,
      javaVersion: HIGHEST_JAVA_VERSION,
    };
  }

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

  // Populate server.access for all existing project members so that
  // assertServerPermission has consistent data regardless of when the
  // server was created relative to when members were added.
  const project = await ProjectModel.findOne({ key: projectKey })
    .select("members")
    .lean();
  if (project?.members.length) {
    const accessEntries = project.members
      .map((m) => ({
        userId: m.userId,
        permissions: ROLE_SERVER_PERMISSIONS[m.role as ProjectMemberRole] ?? [],
      }))
      .filter((e) => e.permissions.length > 0);

    if (accessEntries.length > 0) {
      await ServerModel.findByIdAndUpdate(server._id, {
        $push: { access: { $each: accessEntries } },
      });
    }
  }

  return server.toObject() as IServer;
}

const CONFIG_FIELDS = new Set([
  "image",
  "tag",
  "port",
  "rconPort",
  "memory",
  "cpus",
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

  if (patch.memory != null && server.maxRamMb != null && patch.memory > server.maxRamMb) {
    throw new Error(
      `RAM exceeds blueprint limit: ${patch.memory} MB requested, ${server.maxRamMb} MB allowed`,
    );
  }

  if (patch.cpus != null && server.maxCpus != null && patch.cpus > server.maxCpus) {
    throw new Error(
      `CPU exceeds blueprint limit: ${patch.cpus} cores requested, ${server.maxCpus} cores allowed`,
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
// LIFECYCLE — private execution helpers
// These assume the caller has already done the status claim in DB.
// They always throw on error (re-throw after writing "error" to DB).
// ---------------------------------------------------------------------------

async function _executeStartServer(
  serverId: string,
  server: IServer,
  actorId: string,
): Promise<{ containerId: string }> {
  try {
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
      } catch (containerErr: unknown) {
        const e = containerErr as { statusCode?: number; cause?: { statusCode?: number } };
        const statusCode = e?.statusCode ?? e?.cause?.statusCode ?? 0;
        if (statusCode === 404) {
          await ServerModel.findByIdAndUpdate(serverId, { containerId: null });
        } else {
          throw containerErr;
        }
      }
    }

    const orch = await getOrchestrator();
    const dataDir = getServerDataPath(server.projectKey, server.identifier);
    await ensureServerDir(server.projectKey, server.identifier);

    const config = deployConfigFromDoc(server, dataDir);

    let result;
    try {
      result = await orch.deploy(config);
    } catch (deployErr: unknown) {
      const e = deployErr as { cause?: { json?: { message?: string } }; message?: string };
      const msg = e?.cause?.json?.message ?? e?.message ?? "";
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

async function _executeStopServer(
  serverId: string,
  server: IServer,
  actorId: string,
): Promise<void> {
  try {
    const orch = await getOrchestrator();
    await orch.destroy(server.containerId!, { timeout: 30 });
    await ServerModel.findByIdAndUpdate(serverId, {
      $set: { status: "stopped" },
      $unset: { containerId: 1, containerStatus: 1 },
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

async function _executeSoftStopServer(
  serverId: string,
  server: IServer,
  actorId: string,
): Promise<void> {
  try {
    const docker = await getDockerClient();
    await stopContainer(docker, server.containerId!, 30);
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

// ---------------------------------------------------------------------------
// LIFECYCLE — public synchronous versions (block until Docker op completes)
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
  return _executeStartServer(serverId, server, actorId);
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
  await _executeSoftStopServer(serverId, server, actorId);
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
  await _executeStopServer(serverId, server, actorId);
}

export async function recreateServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");

  if (server.containerId) {
    await stopServer(serverId, actorId);
  }
  await startServer(serverId, actorId);
}

// ---------------------------------------------------------------------------
// LIFECYCLE — async "begin" variants (return immediately, Docker runs in background)
// Use these from API routes to avoid blocking the HTTP response on Docker ops.
// ---------------------------------------------------------------------------

async function _executeVersionUpdateAndStart(
  serverId: string,
  actorId: string,
  latest: string,
): Promise<void> {
  // Claim "starting" first so the UI shows busy and parallel starts are blocked.
  const claimed = await ServerModel.findOneAndUpdate(
    { _id: serverId, status: { $in: ["stopped", "error"] } },
    { $set: { status: "starting" } },
    { returnDocument: "before" },
  );
  if (!claimed) {
    const current = await ServerModel.findById(serverId);
    throw new Error(`Server cannot be started from state: ${current?.status ?? "unknown"}`);
  }

  const from = claimed.resolvedMinecraftVersion ?? null;

  void (async () => {
    // 1) Pre-update backup — orchestration owns the lifecycle, so bypass the
    //    "stopped/running only" guard while status is "starting".
    const backup = await createBackupWithStrategy(
      serverId,
      ["world", "config", "mods", "plugins", "datapacks"],
      actorId,
      { bypassStateGuard: true },
    );

    // 2) Wait for the backup to reach a terminal state.
    const final = await waitForBackupTerminal(backup._id.toString());

    if (final.status !== "completed") {
      await ServerModel.findByIdAndUpdate(serverId, {
        status: "error",
        containerStatus: "pre-update backup failed",
      });
      await logAction(claimed.projectKey, "BACKUP_FAILED", actorId, {
        serverId,
        backupId: backup._id.toString(),
        reason: "pre-update backup failed",
      });
      return;
    }

    await logAction(claimed.projectKey, "BACKUP_CREATED", actorId, {
      serverId,
      backupId: backup._id.toString(),
      reason: "pre-update",
    });

    // 3) Switch version + java, then reload the fresh doc.
    await ServerModel.findByIdAndUpdate(serverId, {
      resolvedMinecraftVersion: latest,
      javaVersion: HIGHEST_JAVA_VERSION,
    });
    const fresh = await ServerModel.findById(serverId);
    if (!fresh) throw new Error("Server not found");

    // 4) Deploy with the same stale-container retry as _executeStartServer.
    try {
      const orch = await getOrchestrator();
      const dataDir = getServerDataPath(fresh.projectKey, fresh.identifier);
      await ensureServerDir(fresh.projectKey, fresh.identifier);
      const config = deployConfigFromDoc(fresh, dataDir);

      let result;
      try {
        result = await orch.deploy(config);
      } catch (deployErr: unknown) {
        const e = deployErr as { cause?: { json?: { message?: string } }; message?: string };
        const msg = e?.cause?.json?.message ?? e?.message ?? "";
        if (msg.includes("is already in use")) {
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

      await logAction(fresh.projectKey, "SERVER_VERSION_UPDATED", actorId, {
        serverId,
        from,
        to: latest,
      });
      await logAction(fresh.projectKey, "SERVER_STARTED", actorId, {
        serverId,
        containerId: result.containerId,
      });
    } catch (err) {
      await ServerModel.findByIdAndUpdate(serverId, {
        status: "error",
        containerStatus: err instanceof Error ? err.message : "deploy failed",
      });
      throw err;
    }
  })().catch((err) =>
    console.error(`[server] Background version-update start failed for ${serverId}:`, err),
  );
}

/**
 * Polls a backup document until it reaches "completed" or "failed".
 * Used by the auto-update orchestration which must wait before switching.
 */
async function waitForBackupTerminal(
  backupId: string,
  timeoutMs = 30 * 60 * 1000,
  intervalMs = 1000,
): Promise<{ status: "completed" | "failed" }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const b = await BackupModel.findById(backupId).lean();
    if (!b) return { status: "failed" };
    if (b.status === "completed" || b.status === "failed") {
      return { status: b.status };
    }
    if (Date.now() > deadline) return { status: "failed" };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Atomically claims "starting" state and fires the Docker start in the background.
 * Returns once the status is set; callers should poll /status for the final state.
 * Throws if the server is not in a startable state.
 */
export async function beginStartServer(
  serverId: string,
  actorId: string,
  opts?: { versionAction?: "update" | "keep" },
): Promise<void> {
  await connectDB();

  await assertNoActiveBackupForServer(serverId);

  // --- Version pre-flight (runs BEFORE the status claim) ---
  const preflight = await ServerModel.findById(serverId);
  if (preflight && versionTracksLatest(preflight)) {
    let latest: string | null = null;
    try {
      latest = await getLatestRelease();
    } catch (err) {
      // Fail-open: a version-check failure must never block a start.
      console.warn(
        `[server] Version pre-flight skipped for ${serverId} (Mojang fetch failed):`,
        err,
      );
    }

    if (latest) {
      const current = preflight.resolvedMinecraftVersion;
      if (current == null) {
        // First start: silently adopt the latest release.
        await ServerModel.findByIdAndUpdate(serverId, {
          resolvedMinecraftVersion: latest,
          javaVersion: HIGHEST_JAVA_VERSION,
        });
      } else if (isUpdateAvailable(current, latest)) {
        if (!opts?.versionAction) {
          throw new VersionUpdateAvailableError(current, latest);
        }
        if (opts.versionAction === "update") {
          await _executeVersionUpdateAndStart(serverId, actorId, latest);
          return;
        }
        // versionAction === "keep" → fall through to a normal start.
      }
    }
  }

  const server = await ServerModel.findOneAndUpdate(
    { _id: serverId, status: { $in: ["stopped", "error"] } },
    { $set: { status: "starting" } },
    { returnDocument: "before" },
  );
  if (!server) {
    const current = await ServerModel.findById(serverId);
    if (!current) throw new Error("Server not found");
    throw new Error(`Server cannot be started from state: ${current.status}`);
  }

  void _executeStartServer(serverId, server, actorId).catch((err) =>
    console.error(`[server] Background start failed for ${serverId}:`, err),
  );
}

/**
 * Returns if no active backup exists for the given server.
 * Throws a descriptive error otherwise.
 */
async function assertNoActiveBackupForServer(serverId: string): Promise<void> {
  const active = await BackupModel.findOne({
    serverId,
    status: { $in: ["pending", "in_progress"] },
  }).lean();
  if (active) {
    throw new Error(
      "Cannot start the server while a backup is in progress. " +
        "Wait for the backup to complete before starting.",
    );
  }
}

/**
 * Atomically claims "stopping" state (hard-stop) and fires Docker destroy in background.
 */
export async function beginStopServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findOneAndUpdate(
    {
      _id: serverId,
      status: { $in: ["running", "starting", "error"] },
      containerId: { $exists: true, $ne: null },
    },
    { $set: { status: "stopping" } },
    { returnDocument: "before" },
  );
  if (!server) {
    const current = await ServerModel.findById(serverId);
    if (!current) throw new Error("Server not found");
    throw new Error(`Server cannot be stopped from state: ${current.status}`);
  }

  void _executeStopServer(serverId, server, actorId).catch((err) =>
    console.error(`[server] Background stop failed for ${serverId}:`, err),
  );
}

/**
 * Atomically claims "stopping" state (soft-stop, keeps container) and fires Docker stop in background.
 */
export async function beginSoftStopServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const server = await ServerModel.findOneAndUpdate(
    {
      _id: serverId,
      status: "running",
      containerId: { $exists: true, $ne: null },
    },
    { $set: { status: "stopping" } },
    { returnDocument: "before" },
  );
  if (!server) {
    const current = await ServerModel.findById(serverId);
    if (!current) throw new Error("Server not found");
    throw new Error(`Server cannot be stopped from state: ${current.status}`);
  }

  void _executeSoftStopServer(serverId, server, actorId).catch((err) =>
    console.error(`[server] Background soft-stop failed for ${serverId}:`, err),
  );
}

/**
 * Atomically claims "stopping" and fires a full recreate (hard-stop then start) in background.
 */
export async function beginRecreateServer(
  serverId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  // Prevent recreate while a backup is in progress (recreate will start the server in Phase 2).
  await assertNoActiveBackupForServer(serverId);

  const server = await ServerModel.findOneAndUpdate(
    { _id: serverId, status: "running" },
    { $set: { status: "stopping" } },
    { returnDocument: "before" },
  );
  if (!server) {
    const current = await ServerModel.findById(serverId);
    if (!current) throw new Error("Server not found");
    throw new Error(`Server cannot be restarted from state: ${current.status}`);
  }

  void (async () => {
    // Phase 1: hard-stop
    await _executeStopServer(serverId, server, actorId);

    // Verify stop succeeded before starting
    const stopped = await ServerModel.findById(serverId);
    if (!stopped || stopped.status !== "stopped") return;

    // Phase 2: check for a backup that may have started during the stop phase,
    // then atomically claim "starting".
    const activeBackup = await BackupModel.findOne({
      serverId,
      status: { $in: ["pending", "in_progress"] },
    }).lean();
    if (activeBackup) {
      console.warn(
        `[server] Recreate Phase 2 aborted for ${serverId}: a backup started during the stop phase.`,
      );
      return;
    }

    const claimed = await ServerModel.findOneAndUpdate(
      { _id: serverId, status: "stopped" },
      { $set: { status: "starting" } },
      { returnDocument: "before" },
    );
    if (!claimed) return;

    await _executeStartServer(serverId, stopped, actorId);
  })().catch((err) =>
    console.error(`[server] Background recreate failed for ${serverId}:`, err),
  );
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

  // Don't interfere with in-progress lifecycle operations — the background worker updates DB when done.
  if (server.status === "starting" || server.status === "stopping") {
    return { status: server.status };
  }

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
