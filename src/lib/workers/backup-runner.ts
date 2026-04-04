import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import { AsyncJobModel, type AsyncJobType } from "@/lib/db/models/async-job";
import { BackupModel } from "@/lib/db/models/backup";
import { logAction } from "@/lib/services/project.service";
import { ServerModel } from "@/lib/db/models/server";

// ---------------------------------------------------------------------------
// Worker script path resolution
// ---------------------------------------------------------------------------

function resolveWorkerScript(): string {
  // In both dev (cwd = project root) and Docker standalone (cwd = /app)
  // the worker lives at <cwd>/scripts/backup-worker.js.
  // In standalone builds, next.config.ts copies it via outputFileTracingIncludes.
  return path.join(process.cwd(), "scripts", "backup-worker.js");
}

// ---------------------------------------------------------------------------
// IPC message types (mirror backup-worker.js)
// ---------------------------------------------------------------------------

type ProgressMsg = { type: "progress"; percent: number; message: string };
type DoneMsg     = { type: "done";     result: Record<string, unknown> };
type ErrorMsg    = { type: "error";    error: string };
type WorkerMsg   = ProgressMsg | DoneMsg | ErrorMsg;

// ---------------------------------------------------------------------------
// Active worker registry (in-process singleton — safe for long-running server)
// ---------------------------------------------------------------------------

const activeWorkers = new Map<string, ReturnType<typeof spawn>>();

export function isJobActive(jobId: string): boolean {
  return activeWorkers.has(jobId);
}

// ---------------------------------------------------------------------------
// Dispatch
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
  });

  const workerScript = resolveWorkerScript();
  const child = spawn("node", [workerScript, type, JSON.stringify(workerPayload)], {
    env: { ...process.env },
    // inherit stdout/stderr so worker logs appear in the parent process output;
    // 'ipc' channel enables process.send() / process.on('message') for progress
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  activeWorkers.set(jobId, child);

  child.on("message", async (raw: WorkerMsg) => {
    try {
      if (raw.type === "progress") {
        await AsyncJobModel.findByIdAndUpdate(jobId, {
          progress: raw.percent,
          message: raw.message,
        });
      } else if (raw.type === "done") {
        await handleDone(jobId, type, raw.result);
        activeWorkers.delete(jobId);
      } else if (raw.type === "error") {
        await AsyncJobModel.findByIdAndUpdate(jobId, {
          status: "error",
          message: raw.error,
          error: raw.error,
        });
        activeWorkers.delete(jobId);
      }
    } catch (err) {
      console.error(`[backup-runner] Failed to process worker message for job ${jobId}:`, err);
    }
  });

  child.on("exit", async (code) => {
    // Only handle if we haven't already received a done/error message
    if (activeWorkers.has(jobId)) {
      activeWorkers.delete(jobId);
      const msg = `Worker exited unexpectedly (code ${code})`;
      await AsyncJobModel.findByIdAndUpdate(jobId, {
        status: "error",
        message: msg,
        error: msg,
      }).catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// Post-completion DB work (per job type)
// ---------------------------------------------------------------------------

async function handleDone(
  jobId: string,
  type: AsyncJobType,
  _result: Record<string, unknown>,
): Promise<void> {
  await connectDB();
  const job = await AsyncJobModel.findById(jobId);
  if (!job) return;

  const meta = job.payload as Record<string, unknown>;

  if (type === "backup:import") {
    const { finalPath, storedFilename, detectedComponents, size } = _result as {
      finalPath: string;
      storedFilename: string;
      detectedComponents: string[];
      size: number;
    };
    const { actorId } = meta as { actorId: string };

    const backup = await BackupModel.create({
      serverId: new mongoose.Types.ObjectId("000000000000000000000000"),
      name: (storedFilename as string).replace(/\.(tar\.gz|tgz|zip)$/i, ""),
      filename: storedFilename,
      path: finalPath,
      size,
      components: detectedComponents,
      status: "completed",
      strategy: "import",
      createdBy: actorId,
    });

    await AsyncJobModel.findByIdAndUpdate(jobId, {
      status: "done",
      progress: 100,
      message: "Import complete",
      result: { backupId: backup._id.toString() },
    });
  } else if (type === "backup:restore") {
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

    await AsyncJobModel.findByIdAndUpdate(jobId, {
      status: "done",
      progress: 100,
      message: "Restore complete",
      result: {},
    });
  } else if (type === "backup:create") {
    const { filePath, size } = _result as { filePath: string; size: number };
    const { backupId, actorId, serverId, components } = meta as {
      backupId: string;
      actorId: string;
      serverId: string;
      components: string[];
    };

    await BackupModel.findByIdAndUpdate(backupId, {
      status: "completed",
      path: filePath,
      size,
    });

    const server = await ServerModel.findById(serverId);
    if (server) {
      await logAction(server.projectKey, "BACKUP_CREATED", actorId, {
        backupId,
        serverId,
        components,
      });
    }

    await AsyncJobModel.findByIdAndUpdate(jobId, {
      status: "done",
      progress: 100,
      message: "Backup complete",
      result: { backupId },
    });
  }
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
}
