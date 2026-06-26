/**
 * Auto-update orchestrator (#20).
 *
 * Applies an Aethera panel update — but only after in-flight work (async jobs
 * and module installs/updates) has finished. The panel runs as the
 * `aethera-app` Docker container from `ghcr.io/jaameypr/aethera-next:<tag>` with
 * the Docker socket mounted.
 *
 * A process cannot cleanly recreate the very container it runs in: tearing down
 * `aethera-app` mid-call would kill this Node process before the new container
 * could be renamed/started, and a detached shell helper that does
 * `docker rm -f aethera-app` would permanently down the panel if anything after
 * the removal fails. The hard requirement is therefore that NO path here removes
 * `aethera-app` without recreating it. Until a verified self-recreate exists,
 * even the `AETHERA_SELF_UPDATE` path stops at "image pulled" and asks the
 * operator (or their compose/run wrapper) to recreate the container. The flag is
 * EXPERIMENTAL and never exercised by unit tests.
 *
 * Audit trail: there is no system-level audit model (project.service.logAction
 * is scoped to a project key and a typed ProjectLogAction), so each major step
 * is logged to the console with an `[aethera-update]` prefix.
 */
import "server-only";

import { AsyncJobModel } from "@/lib/db/models/async-job";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { getUpdateStatus } from "@/lib/services/app-version.service";
import { getDockerClient } from "@/lib/docker/orchestrator";
import { HttpError } from "@/lib/api/errors";

const IMAGE_NAME = "ghcr.io/jaameypr/aethera-next";
const APP_CONTAINER = "aethera-app";

/** Poll interval used by `drainJobs`. */
const POLL_INTERVAL_MS = 1000;

/**
 * Raised when an update is requested while jobs are still in flight and the
 * caller did not opt to wait. Maps to HTTP 409 and carries the running count
 * so the API layer can surface it.
 */
export class JobsInFlightError extends HttpError {
  constructor(public readonly runningJobs: number) {
    super(
      409,
      `Cannot update while ${runningJobs} job(s) are still running. Retry with wait=true to drain them first.`,
      "JOBS_IN_FLIGHT",
    );
    this.name = "JobsInFlightError";
  }
}

/**
 * Number of operations currently in flight: pending/running async jobs plus
 * modules in a transitional (installing/updating/uninstalling) state.
 */
export async function countInFlight(): Promise<number> {
  const [jobs, modules] = await Promise.all([
    AsyncJobModel.countDocuments({ status: { $in: ["pending", "running"] } }),
    InstalledModuleModel.countDocuments({
      status: { $in: ["installing", "updating", "uninstalling"] },
    }),
  ]);
  return jobs + modules;
}

/**
 * Polls `countInFlight()` every second until it reaches zero. Rejects with a
 * clear error if `timeoutMs` elapses first.
 */
export async function drainJobs(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  // Resolve immediately if nothing is in flight.
  if ((await countInFlight()) === 0) return;

  return new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      void (async () => {
        let remaining: number;
        try {
          remaining = await countInFlight();
        } catch (error) {
          clearInterval(timer);
          reject(error);
          return;
        }

        if (remaining === 0) {
          clearInterval(timer);
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          clearInterval(timer);
          reject(
            new Error(
              `Timed out after ${timeoutMs}ms waiting for ${remaining} job(s) to finish.`,
            ),
          );
        }
      })();
    }, POLL_INTERVAL_MS);

    // Unref so a pending timer never keeps the process alive.
    (timer as unknown as { unref?: () => void }).unref?.();
  });
}

export interface RunUpdateOptions {
  /** When true, wait for in-flight jobs to drain instead of failing fast. */
  wait?: boolean;
  /** The id of the admin who triggered the update (for the audit trail). */
  actorId?: string;
}

export interface RunUpdateResult {
  status: string;
  [key: string]: unknown;
}

/**
 * Apply a panel update:
 *  1. Confirm an update is actually available (force-refresh the check).
 *  2. Refuse (409) — or wait — if jobs are still in flight.
 *  3. Pull the target image.
 *  4. Return a "pulled, apply manually" status. Recreating `aethera-app` is
 *     left to the operator (or their compose/run wrapper) so a failed teardown
 *     can never leave the panel down. `AETHERA_SELF_UPDATE` is EXPERIMENTAL and
 *     currently only changes the operator instruction that is logged/returned.
 */
export async function runUpdate(
  opts: RunUpdateOptions = {},
): Promise<RunUpdateResult> {
  const { wait = false, actorId } = opts;

  log("requested", { actorId, wait });

  // (a) Confirm an update is available.
  const status = await getUpdateStatus(true);
  if (!status.updateAvailable || !status.imageTag) {
    throw new HttpError(
      400,
      "No update is available; the panel is already up to date.",
      "NO_UPDATE_AVAILABLE",
    );
  }
  const imageTag = status.imageTag;
  const imageRef = `${IMAGE_NAME}:${imageTag}`;

  // (b) Gate on in-flight work.
  const n = await countInFlight();
  if (n > 0) {
    if (!wait) {
      log("blocked-busy", { runningJobs: n });
      throw new JobsInFlightError(n);
    }
    log("draining", { runningJobs: n });
    await drainJobs(10 * 60 * 1000); // up to 10 minutes
    log("drained", {});
  }

  // (c) Pull the new image.
  log("pulling", { imageRef });
  const docker = await getDockerClient();
  const { pullImage } = await import("@pruefertit/docker-orchestrator");
  await pullImage(docker, imageRef);
  log("pulled", { imageRef });

  // (d) Apply.
  //
  // Hard requirement: never remove `aethera-app` without recreating it. A clean
  // self-recreate is not achievable from this process — `recreateContainer`
  // would stop the very container running this code mid-call, killing the
  // process before the new container is renamed/started, and a detached
  // `docker rm -f aethera-app` helper would permanently down the panel on any
  // post-removal failure. So we stop at "image pulled" in BOTH modes and leave
  // the actual recreate to the operator (or their compose/run wrapper).
  const selfUpdate = process.env.AETHERA_SELF_UPDATE === "true";
  const recreateHint = `docker compose -f <your-compose-file> up -d --pull always ${APP_CONTAINER}`;
  const message = selfUpdate
    ? `New image pulled. AETHERA_SELF_UPDATE is EXPERIMENTAL and does not auto-recreate the panel: recreate the ${APP_CONTAINER} container to apply (e.g. \`${recreateHint}\`).`
    : `New image pulled. Recreate the ${APP_CONTAINER} container to apply (e.g. \`${recreateHint}\`).`;

  log("pulled:manual-apply", { imageRef, selfUpdate, recreateHint });

  return {
    status: "pulled",
    manual: true,
    imageTag,
    message,
  };
}

/** Lightweight console audit — keeps a structured trail without a new model. */
function log(step: string, details: Record<string, unknown>): void {
  console.log(`[aethera-update] ${step}`, JSON.stringify(details));
}
