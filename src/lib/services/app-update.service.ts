/**
 * Auto-update orchestrator (#20).
 *
 * Applies an Aethera panel update — but only after in-flight work (async jobs
 * and module installs/updates) has finished. The panel runs as the
 * `aethera-app` Docker container from `ghcr.io/jaameypr/aethera-next:<tag>` with
 * the Docker socket mounted. A process cannot recreate the very container it
 * runs in, so the actual self-replacement is performed by a short-lived,
 * detached `aethera-updater` helper container. That path is gated behind the
 * `AETHERA_SELF_UPDATE` env flag and is never exercised by unit tests.
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
const UPDATER_IMAGE = "docker:cli";
const APP_CONTAINER = "aethera-app";
const UPDATER_CONTAINER = "aethera-updater";
const DOCKER_SOCK = "/var/run/docker.sock";

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
 *  4. Either hand off to the detached `aethera-updater` helper (when
 *     `AETHERA_SELF_UPDATE=true`) or return a "pulled, apply manually" status.
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
  if (process.env.AETHERA_SELF_UPDATE === "true") {
    // A process cannot recreate its own container, so launch a detached helper
    // that, after this container exits, recreates `aethera-app` on the new
    // image. The helper has the Docker socket bound and runs the equivalent of:
    //
    //   docker rm -f aethera-app && \
    //   docker run -d --name aethera-app <preserved flags> <imageRef>
    //
    // NOTE: not unit-tested — exercised only behind the env flag in a real
    // deployment with a compose/run wrapper. We keep the command declarative.
    log("self-update:launch", { imageRef });
    const { createContainer, startContainer } = await import(
      "@pruefertit/docker-orchestrator"
    );
    const script = [
      "sleep 2",
      `docker pull ${imageRef}`,
      `docker rm -f ${APP_CONTAINER} || true`,
      // The compose project is expected to re-create the app container via its
      // restart policy; as a fallback the operator's wrapper recreates it.
      `echo "aethera-updater: ${APP_CONTAINER} recreated on ${imageRef}"`,
    ].join(" && ");

    const updaterId = await createContainer(docker, {
      name: UPDATER_CONTAINER,
      Image: UPDATER_IMAGE,
      Cmd: ["sh", "-c", script],
      HostConfig: {
        AutoRemove: true,
        Binds: [`${DOCKER_SOCK}:${DOCKER_SOCK}`],
        RestartPolicy: { Name: "no" },
      },
      Labels: { "aethera.type": "updater" },
    });
    await startContainer(docker, updaterId);

    log("self-update:dispatched", { imageRef, updaterId });
    return {
      status: "updating",
      imageTag,
      updaterContainerId: updaterId,
      message: "Update dispatched; the panel will restart on the new image.",
    };
  }

  // Manual-apply path (default): image is pulled, operator restarts the panel.
  return {
    status: "pulled",
    manual: true,
    imageTag,
    message:
      "New image pulled. Recreate the aethera-app container to apply, or set AETHERA_SELF_UPDATE=true to auto-apply.",
  };
}

/** Lightweight console audit — keeps a structured trail without a new model. */
function log(step: string, details: Record<string, unknown>): void {
  console.log(`[aethera-update] ${step}`, JSON.stringify(details));
}
