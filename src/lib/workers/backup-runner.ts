import "server-only";

import { exec } from "node:child_process";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { AsyncJobModel, type AsyncJobType } from "@/lib/db/models/async-job";
import { BackupModel } from "@/lib/db/models/backup";
import { logAction } from "@/lib/services/project.service";
import { ServerModel } from "@/lib/db/models/server";
import { sendServerEventToDiscordModule } from "@/lib/services/discord-module.service";
import { issueMinecraftSaveOn } from "@/lib/services/minecraft-saves";

// ---------------------------------------------------------------------------
// Worker script resolution
//
// Set AETHERA_WORKER_SCRIPT to the absolute path of scripts/backup-worker.js.
// Docker: set in docker-entrypoint.sh.
// Dev: add AETHERA_WORKER_SCRIPT=<project_root>/scripts/backup-worker.js to .env.local
// ---------------------------------------------------------------------------

function resolveWorkerScript(): string {
  const script = process.env.AETHERA_WORKER_SCRIPT;
  if (!script) {
    throw new Error(
      "[backup-runner] AETHERA_WORKER_SCRIPT env var is not set. " +
        "Set it to the absolute path of scripts/backup-worker.js.",
    );
  }
  return script;
}

// ---------------------------------------------------------------------------
// Dispatch — fire-and-forget via exec().
//
// exec() takes a plain shell command string; Turbopack does NOT analyze
// shell strings as module paths (unlike fork/spawn which are special-cased).
// The worker process connects to MongoDB independently and updates the
// AsyncJob document directly — no IPC channel needed.
// ---------------------------------------------------------------------------

export async function dispatchBackupJob(
  jobId: string,
  type: AsyncJobType,
  workerPayload: Record<string, unknown>,
): Promise<void> {
  await connectDB();
  await AsyncJobModel.findByIdAndUpdate(jobId, {
    status: "running",
    message: "Starting…",
    // Store payload so the worker can load the full job spec from MongoDB
    payload: workerPayload,
  });

  const script = resolveWorkerScript();
  // jobId contains only hex chars — safe to interpolate without quoting
  const cmd = `node "${script}" "${jobId}"`;

  exec(cmd, { env: { ...process.env } }, (err) => {
    if (err) {
      console.error(`[backup-runner] Worker for job ${jobId} exited with error:`, err.message);
      // Best-effort: mark job as failed if the worker didn't update it already
      AsyncJobModel.findOneAndUpdate(
        { _id: jobId, status: { $in: ["pending", "running"] } },
        { status: "error", error: err.message },
      ).catch(() => {});
    }

    // For backup:create jobs, re-enable Minecraft saves (if they were disabled)
    // and send a Discord notification on completion or failure.
    // Look up the backup by jobId (set when the backup record is created) to get the
    // server context without relying on the payload (which is overwritten by workerPayload).
    if (type === "backup:create") {
      BackupModel.findOne({ jobId }).then(async (backup) => {
        if (!backup) return;
        const server = await ServerModel.findById(backup.serverId);
        if (!server) return;

        // Re-enable auto-save if save-off was issued before the worker started.
        if (backup.saveOffIssued) {
          await issueMinecraftSaveOn(server._id.toString());
          await BackupModel.findByIdAndUpdate(backup._id, { saveOffIssued: false });
        }

        const details = err
          ? `Backup failed: ${err.message}`
          : `Backup "${backup.filename}" completed successfully.`;
        await sendServerEventToDiscordModule(
          server._id.toString(),
          err ? "BACKUP_FAILED" : "BACKUP_COMPLETED",
          server.name,
          details,
        );
      }).catch((e) => console.warn("[backup-runner] Post-worker cleanup failed:", e));
    }
  });
}

// ---------------------------------------------------------------------------
// Post-completion helpers — called by the worker via MongoDB updates,
// but DB-side audit logging still needs to happen in the main process
// on the next SSE poll / job fetch. We expose this so the GET /jobs/[id]
// route can trigger it lazily on first "done" read.
// ---------------------------------------------------------------------------

export async function finalizeJob(jobId: string): Promise<void> {
  await connectDB();
  const job = await AsyncJobModel.findById(jobId);
  if (!job || job.status !== "done" || job.result?.finalized) return;

  const type = job.type as AsyncJobType;
  const meta = job.payload as Record<string, unknown>;

  if (type === "backup:restore") {
    const { backupId, serverId, components, actorId } = meta as {
      backupId: string;
      serverId: string;
      components: string[];
      actorId: string;
    };
    const backup = await BackupModel.findById(backupId);
    const server = await ServerModel.findById(serverId);
    if (backup && server) {
      await logAction(server.projectKey, "BACKUP_RESTORED", actorId, {
        backupId,
        serverId,
        filename: backup.filename,
        components,
      });
    }
  } else if (type === "backup:create") {
    const { backupId, actorId, serverId, components } = meta as {
      backupId: string;
      actorId: string;
      serverId: string;
      components: string[];
    };
    const server = await ServerModel.findById(serverId);
    if (server) {
      await logAction(server.projectKey, "BACKUP_CREATED", actorId, {
        backupId,
        serverId,
        components,
      });
    }
  }

  await AsyncJobModel.findByIdAndUpdate(jobId, { "result.finalized": true });
}

// ---------------------------------------------------------------------------
// Startup cleanup — reset any jobs that were "running" when the server
// previously crashed/restarted (their worker processes are gone).
// ---------------------------------------------------------------------------

export async function resetStuckJobs(): Promise<void> {
  await connectDB();
  const result = await AsyncJobModel.updateMany(
    { status: "running" },
    { status: "error", error: "Server restarted while job was in progress" },
  );
  if (result.modifiedCount > 0) {
    console.warn(`[backup-runner] Reset ${result.modifiedCount} stuck job(s) to error status`);
  }

  // Re-enable Minecraft saves for any backup where save-off was issued but
  // Aethera crashed before save-on could be sent.
  //
  // Worker-path (strategy:"sync") backups: the worker process is guaranteed dead
  // after a restart, so we mark these failed and restore saves.
  //
  // Async-path (strategy:"async") backups: the Java module may still be running
  // and will call back when done. We re-enable saves immediately (safest for the
  // running server) and clear the flag; the callback will complete the record.
  const stuckWithSaveOff = await BackupModel.find({
    saveOffIssued: true,
    status: { $in: ["pending", "in_progress"] },
  });

  for (const backup of stuckWithSaveOff) {
    await issueMinecraftSaveOn(backup.serverId.toString());
    const update: Record<string, unknown> = { saveOffIssued: false };
    if (backup.strategy === "sync") {
      update.status = "failed";
      update.errorMessage = "Server restarted while backup was in progress";
    }
    await BackupModel.findByIdAndUpdate(backup._id, update);
    console.warn(
      `[backup-runner] Restored saves for server ${backup.serverId} ` +
        `(backup ${backup._id}, strategy:${backup.strategy})`,
    );
  }
}

