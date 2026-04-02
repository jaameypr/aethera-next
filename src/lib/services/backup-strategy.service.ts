import "server-only";

import { readFile } from "node:fs/promises";
import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { BackupModel, type IBackup, type BackupComponent } from "@/lib/db/models/backup";
import { ServerModel } from "@/lib/db/models/server";
import { createBackup as createSyncBackup } from "@/lib/services/backup.service";
import { uploadBackupToShare, isPaperviewReady } from "@/lib/services/paperview.service";
import { getBackupDir } from "@/lib/docker/storage";
import { logAction } from "@/lib/services/project.service";
import { HttpError } from "@/lib/api/errors";

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

  // Sync path: create backup in-process, then optionally upload to Paperview
  const backup = await createSyncBackup(serverId, components, actorId);

  if (caps.sharing) {
    try {
      const result = await shareBackup(backup._id.toString());
      return result;
    } catch (err) {
      console.error("[backup-strategy] Paperview upload failed (non-fatal):", err);
    }
  }

  return backup;
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
  if (!server) throw new HttpError(404, "Server nicht gefunden");
  if (server.status !== "stopped") {
    throw new HttpError(400, "Server muss gestoppt sein, um ein Backup zu erstellen");
  }

  const asyncMod = await InstalledModuleModel.findOne({
    moduleId: "async-backups",
    status: "running",
  }).lean();

  if (!asyncMod?.internalUrl) {
    throw new HttpError(503, "Async-Backups Modul URL nicht verfügbar");
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
      serverIdentifier: server.identifier,
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
    throw new HttpError(502, `Async Backup fehlgeschlagen (${res.status}): ${body}`);
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
  if (!backup) throw new HttpError(404, "Backup nicht gefunden");

  if (payload.status === "completed") {
    backup.status = "completed";
    backup.filename = payload.filename ?? backup.filename;
    backup.size = payload.size ?? backup.size;
    backup.path = payload.path ?? backup.path;
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
  }

  return backup.toObject() as IBackup;
}

/* ------------------------------------------------------------------ */
/*  Share — upload an existing backup to Paperview                    */
/* ------------------------------------------------------------------ */

export async function shareBackup(backupId: string): Promise<IBackup> {
  await connectDB();

  const backup = await BackupModel.findById(backupId);
  if (!backup) throw new HttpError(404, "Backup nicht gefunden");
  if (backup.status !== "completed") throw new HttpError(400, "Backup ist nicht abgeschlossen");
  if (backup.shareUrl) throw new HttpError(409, "Backup wurde bereits geteilt");

  const ready = await isPaperviewReady();
  if (!ready) throw new HttpError(503, "Paperview ist nicht verfügbar");

  const fileBuffer = await readFile(backup.path);

  const result = await uploadBackupToShare({
    file: fileBuffer,
    filename: backup.filename,
    title: `Backup: ${backup.name} — ${new Date(backup.createdAt).toLocaleString("de-DE")}`,
    description: `Server backup (${backup.components.join(", ")})`,
  });

  backup.shareUrl = result.shareUrl;
  backup.shareId = result.shareId;
  await backup.save();

  return backup.toObject() as IBackup;
}
