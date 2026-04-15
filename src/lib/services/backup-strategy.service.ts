import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { BackupModel, type IBackup, type BackupComponent } from "@/lib/db/models/backup";
import { AsyncJobModel, type IAsyncJob } from "@/lib/db/models/async-job";
import { ServerModel } from "@/lib/db/models/server";
import { createBackup as createSyncBackup } from "@/lib/services/backup.service";
import { uploadBackupToShare, isPaperviewReady } from "@/lib/services/paperview.service";
import { getBackupDir, getServerDataPath, resolveServerDataPath } from "@/lib/docker/storage";
import { logAction } from "@/lib/services/project.service";
import { dispatchBackupJob } from "@/lib/workers/backup-runner";
import { badRequest } from "@/lib/api/errors";
import { sendServerEventToDiscordModule } from "@/lib/services/discord-module.service";

/* ------------------------------------------------------------------ */
/*  Capabilities — what the system can do based on installed modules   */
/* ------------------------------------------------------------------ */

export interface BackupCapabilities {
  async: boolean;
  sharing: boolean;
}

export async function getBackupCapabilities(): Promise<BackupCapabilities> {
  await connectDB();

  const [asyncMod, paperviewReady] = await Promise.all([
    InstalledModuleModel.findOne({
      moduleId: "async-backups",
      status: "running",
    }).lean(),
    isPaperviewReady(),
  ]);

  return {
    async: !!asyncMod,
    sharing: paperviewReady,
  };
}

/* ------------------------------------------------------------------ */
/*  Strategy — route backup creation to the right implementation      */
/* ------------------------------------------------------------------ */

export async function createBackupWithStrategy(
  serverId: string,
  components: BackupComponent[],
  actorId: string,
): Promise<IBackup> {
  const caps = await getBackupCapabilities();

  if (caps.async) {
    return createAsyncBackup(serverId, components, actorId, caps.sharing);
  }

  // Worker path: create backup off the main thread
  return createBackupViaWorker(serverId, components, actorId, caps.sharing);
}

/* ------------------------------------------------------------------ */
/*  Async backup — delegate to the async-backups module               */
/* ------------------------------------------------------------------ */

async function createAsyncBackup(
  serverId: string,
  components: BackupComponent[],
  actorId: string,
  sharingAvailable: boolean,
): Promise<IBackup> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw badRequest("Server must be stopped to create a backup");
  }

  // Resolve actual data directory (handles legacy identifier-only dir naming)
  const dataPath = await resolveServerDataPath(server.projectKey, server.identifier);
  try {
    await stat(dataPath);
  } catch {
    throw badRequest(
      `Server data directory does not exist (${dataPath}). ` +
        "Ensure the server has been started at least once before creating a backup.",
    );
  }
  const serverDataIdentifier = path.basename(dataPath);

  const asyncMod = await InstalledModuleModel.findOne({
    moduleId: "async-backups",
    status: "running",
  }).lean();

  if (!asyncMod?.internalUrl) {
    throw new Error("Async-backups module URL not available");
  }

  // Determine paperview URL if available
  let paperviewUrl: string | undefined;
  let paperviewApiKey: string | undefined;
  if (sharingAvailable) {
    const pvMod = await InstalledModuleModel.findOne({
      moduleId: "paperview",
      status: "running",
    }).lean();
    if (pvMod) {
      paperviewUrl = pvMod.internalUrl ?? undefined;
      paperviewApiKey = pvMod.config.find((c) => c.key === "__API_KEY")?.value;
    }
  }

  // Build a placeholder filename (the module will create the real file)
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${ts}-${safeName}.tar.gz`;

  // Create a pending backup record
  const backup = await BackupModel.create({
    serverId: server._id,
    name: server.name,
    filename,
    path: `${getBackupDir()}/${serverId}/${filename}`,
    size: 0,
    components,
    status: "pending",
    strategy: "async",
    createdBy: actorId,
  });

  // Determine callback URL
  const baseUrl = process.env.AETHERA_INTERNAL_URL || "http://aethera-app:3000";
  const callbackUrl = `${baseUrl}/api/backups/callback`;

  // Send request to async module
  const res = await fetch(`${asyncMod.internalUrl}/api/backups/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      serverId: server._id.toString(),
      serverIdentifier: serverDataIdentifier,
      serverName: server.name,
      components,
      callbackUrl,
      backupId: backup._id.toString(),
      actorId,
      ...(paperviewUrl && paperviewApiKey
        ? { paperviewUrl, paperviewApiKey }
        : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    await BackupModel.findByIdAndUpdate(backup._id, {
      status: "failed",
      errorMessage: `Async module responded ${res.status}: ${body}`,
    });
    throw new Error(`Async backup request failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Store the job ID from the async module
  await BackupModel.findByIdAndUpdate(backup._id, {
    status: "in_progress",
    jobId: data.jobId,
  });

  await logAction(server.projectKey, "BACKUP_STARTED", actorId, {
    backupId: backup._id.toString(),
    serverId,
    strategy: "async",
    jobId: data.jobId,
  });

  return (await BackupModel.findById(backup._id).lean()) as IBackup;
}

/* ------------------------------------------------------------------ */
/*  Callback — called by the async module when a job finishes         */
/* ------------------------------------------------------------------ */

export async function completeAsyncBackup(payload: {
  backupId: string;
  jobId: string;
  status: "completed" | "failed";
  filename?: string;
  size?: number;
  path?: string;
  error?: string;
  shareUrl?: string;
  shareId?: string;
}): Promise<IBackup> {
  await connectDB();

  const backup = await BackupModel.findById(payload.backupId);
  if (!backup) throw new Error("Backup not found");

  if (payload.status === "completed") {
    backup.status = "completed";
    backup.filename = payload.filename ?? backup.filename;
    backup.size = payload.size ?? backup.size;

    // Translate path from module's mount (/aethera/backups/...) to Aethera's backup dir
    if (payload.path) {
      const moduleBackupPrefix = "/aethera/backups/";
      if (payload.path.startsWith(moduleBackupPrefix)) {
        const relativePath = payload.path.slice(moduleBackupPrefix.length);
        backup.path = `${getBackupDir()}/${relativePath}`;
      } else {
        backup.path = payload.path;
      }
    }

    if (payload.shareUrl) backup.shareUrl = payload.shareUrl;
    if (payload.shareId) backup.shareId = payload.shareId;
  } else {
    backup.status = "failed";
    backup.errorMessage = payload.error ?? "Unknown error";
  }

  await backup.save();

  const server = await ServerModel.findById(backup.serverId);
  if (server) {
    await logAction(
      server.projectKey,
      payload.status === "completed" ? "BACKUP_COMPLETED" : "BACKUP_FAILED",
      backup.createdBy.toString(),
      {
        backupId: backup._id.toString(),
        serverId: backup.serverId.toString(),
        strategy: "async",
        jobId: payload.jobId,
      },
    );

    const details =
      payload.status === "completed"
        ? `Backup "${payload.filename ?? backup.filename}" completed successfully.`
        : `Backup failed: ${payload.error ?? "Unknown error"}`;
    sendServerEventToDiscordModule(
      server._id.toString(),
      payload.status === "completed" ? "BACKUP_COMPLETED" : "BACKUP_FAILED",
      server.name,
      details,
    ).catch((e) => console.warn("[backup-strategy] Discord notify failed:", e));
  }

  return backup.toObject() as IBackup;
}

/* ------------------------------------------------------------------ */
/*  Share — upload an existing backup to Paperview                    */
/* ------------------------------------------------------------------ */

export async function shareBackup(
  backupId: string,
  force = false,
): Promise<IBackup> {
  await connectDB();

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");
  if (backup.status !== "completed") throw new Error("Backup is not completed");
  if (backup.shareUrl && !force) throw new Error("Backup already shared");

  const ready = await isPaperviewReady();
  if (!ready) throw new Error("Paperview is not available");

  const result = await uploadBackupToShare({
    filePath: backup.path,
    filename: backup.filename,
    title: `Backup: ${backup.name} — ${new Date(backup.createdAt).toLocaleString("de-DE")}`,
    description: `Server backup (${backup.components.join(", ")})`,
  });

  backup.shareUrl = result.shareUrl;
  backup.shareId = result.shareId;
  await backup.save();

  return backup.toObject() as IBackup;
}

/* ------------------------------------------------------------------ */
/*  Worker-backed paths (built-in fallback — no external module)      */
/* ------------------------------------------------------------------ */

/**
 * Create a backup using an off-thread worker process.
 * Returns an IBackup with status "in_progress"; the backup is updated
 * to "completed" by the runner once the worker finishes.
 */
async function createBackupViaWorker(
  serverId: string,
  components: BackupComponent[],
  actorId: string,
  sharingAvailable: boolean,
): Promise<IBackup> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw badRequest("Server must be stopped to create a backup");
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${ts}-${safeName}.tar.gz`;
  const destDir = path.join(getBackupDir(), serverId);
  const filePath = path.join(destDir, filename);

  const backup = await BackupModel.create({
    serverId: server._id,
    name: server.name,
    filename,
    path: filePath,
    size: 0,
    components,
    status: "in_progress",
    strategy: "sync",
    createdBy: actorId,
  });

  const job = await AsyncJobModel.create({
    type: "backup:create",
    status: "pending",
    progress: 0,
    message: "Queued",
    payload: {
      backupId: backup._id.toString(),
      serverId,
      actorId,
      components,
      sharingAvailable,
    },
  });

  await BackupModel.findByIdAndUpdate(backup._id, { jobId: job._id.toString() });

  await logAction(server.projectKey, "BACKUP_STARTED", actorId, {
    backupId: backup._id.toString(),
    serverId,
    strategy: "worker",
  });

  const serverDir = await resolveServerDataPath(server.projectKey, server.identifier);
  dispatchBackupJob(job._id.toString(), "backup:create", {
    serverDir,
    destDir,
    filename,
    components,
  }).catch((err) => {
    console.error(`[backup-strategy] Failed to dispatch backup:create job ${job._id}:`, err);
  });

  return (await BackupModel.findById(backup._id).lean()) as IBackup;
}

/**
 * Restore selected components from a backup to a server, off the main thread.
 * Returns a job record that the client can poll via GET /api/jobs/[jobId].
 */
export async function restoreBackupViaWorker(
  backupId: string,
  serverId: string,
  components: BackupComponent[],
  actorId: string,
): Promise<IAsyncJob> {
  await connectDB();

  const server = await ServerModel.findById(serverId);
  if (!server) throw new Error("Server not found");
  if (server.status !== "stopped") {
    throw badRequest("Server must be stopped to restore a backup");
  }

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new Error("Backup not found");

  const job = await AsyncJobModel.create({
    type: "backup:restore",
    status: "pending",
    progress: 0,
    message: "Queued",
    payload: { backupId, serverId, components, actorId },
  });

  const serverDir = await resolveServerDataPath(server.projectKey, server.identifier);
  dispatchBackupJob(job._id.toString(), "backup:restore", {
    backupPath: backup.path,
    serverDir,
    components,
  }).catch((err) => {
    console.error(`[backup-strategy] Failed to dispatch backup:restore job ${job._id}:`, err);
  });

  return job.toObject() as IAsyncJob;
}

/**
 * Import a backup file off the main thread.
 * Returns a job record; the backup document is created when the worker finishes.
 */
export async function importBackupViaWorker(
  tempFilePath: string,
  filename: string,
  actorId: string,
): Promise<IAsyncJob> {
  await connectDB();

  const importDir = path.join(getBackupDir(), "imports");

  const job = await AsyncJobModel.create({
    type: "backup:import",
    status: "pending",
    progress: 0,
    message: "Queued",
    payload: { actorId },
  });

  dispatchBackupJob(job._id.toString(), "backup:import", {
    tempFilePath,
    filename,
    importDir,
  }).catch((err) => {
    console.error(`[backup-strategy] Failed to dispatch backup:import job ${job._id}:`, err);
  });

  return job.toObject() as IAsyncJob;
}

