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
 * could be renamed/started. So when `AETHERA_SELF_UPDATE === "true"` we launch a
 * DETACHED ONE-SHOT HELPER CONTAINER from the NEW image (`aethera-updater`). The
 * new image already ships node + dockerode + `scripts/self-update-finish.js`, so
 * the helper can stop/rename/recreate `aethera-app` and OUTLIVE the old panel.
 * The finisher does RENAME-BASED ROLLBACK (rename live → `-prev`, create+verify
 * new, only then delete `-prev`; on any failure it restores `-prev`), so the
 * panel is never left without a running `aethera-app`. The flag is EXPERIMENTAL.
 *
 * With the flag unset (default) we stop at "image pulled" and leave the recreate
 * to the operator (or their compose/run wrapper).
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
/** Detached one-shot helper that recreates the panel container (#20). */
const UPDATER_CONTAINER = "aethera-updater";
/** Network the panel + helper share so the finisher can reach the daemon/DNS. */
const UPDATER_NETWORK = "aethera-net";
/** Path the finisher script ships at inside the standalone image. */
const FINISHER_PATH = "/app/scripts/self-update-finish.js";

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
 *  4. If `AETHERA_SELF_UPDATE === "true"` (EXPERIMENTAL): launch a detached
 *     one-shot helper container from the NEW image that recreates `aethera-app`
 *     (rename-based rollback), and return `{status:"updating", restarting:true}`.
 *     Otherwise return "pulled, apply manually" and leave the recreate to the
 *     operator (or their compose/run wrapper).
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
  // Helper-from-new-image pattern: a process can't cleanly recreate the very
  // container it runs in, so under AETHERA_SELF_UPDATE we launch a DETACHED
  // one-shot helper container started FROM THE NEW IMAGE (`aethera-updater`).
  // That image already ships node + dockerode + `scripts/self-update-finish.js`,
  // so the helper outlives the old panel and can stop/rename/recreate
  // `aethera-app`. The finisher does RENAME-BASED ROLLBACK (rename live → -prev,
  // create+verify new, only then delete -prev; restore -prev on any failure), so
  // the panel is never left without a running `aethera-app`.
  const selfUpdate = process.env.AETHERA_SELF_UPDATE === "true";

  if (selfUpdate) {
    log("self-update:launching-helper", { imageRef });

    // Clear any stale helper from a previous run to avoid a name clash.
    await docker
      .getContainer(UPDATER_CONTAINER)
      .remove({ force: true })
      .catch(() => {});

    const helper = await docker.createContainer({
      name: UPDATER_CONTAINER,
      Image: imageRef,
      Cmd: ["node", FINISHER_PATH, APP_CONTAINER, imageRef],
      Labels: { "aethera.role": "updater" },
      HostConfig: {
        Binds: ["/var/run/docker.sock:/var/run/docker.sock"],
        AutoRemove: true,
        NetworkMode: UPDATER_NETWORK,
        RestartPolicy: { Name: "no" },
      },
    });
    await helper.start();

    log("self-update:helper-started", { imageRef, container: UPDATER_CONTAINER });

    return {
      status: "updating",
      restarting: true,
      imageTag,
      message: `New image pulled. The ${APP_CONTAINER} container is being recreated by the detached ${UPDATER_CONTAINER} helper; the panel will restart shortly.`,
    };
  }

  // Flag unset: stop at "image pulled" and leave the recreate to the operator.
  const recreateHint = `docker compose -f <your-compose-file> up -d --pull always ${APP_CONTAINER}`;
  log("pulled:manual-apply", { imageRef, recreateHint });

  return {
    status: "pulled",
    manual: true,
    imageTag,
    message: `New image pulled. Recreate the ${APP_CONTAINER} container to apply (e.g. \`${recreateHint}\`).`,
  };
}

/** Lightweight console audit — keeps a structured trail without a new model. */
function log(step: string, details: Record<string, unknown>): void {
  console.log(`[aethera-update] ${step}`, JSON.stringify(details));
}
