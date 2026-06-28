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
 * could be started. So when `AETHERA_SELF_UPDATE === "true"` we launch a
 * DETACHED ONE-SHOT HELPER CONTAINER (`aethera-updater`, from `docker:cli`) that
 * OUTLIVES the old panel and DELEGATES the recreate to `docker compose up -d`.
 *
 * We do NOT hand-recreate the container via dockerode: a hand-built container
 * loses compose-managed state (network aliases such as `app` that the Cloudflare
 * tunnel resolves, exact port bindings, the tunnel overlay), leaving the panel
 * unreachable. Instead we read Compose v2's own labels off `aethera-app`
 * (`com.docker.compose.project.working_dir`, `…config_files`, `…service`) to
 * reproduce the exact compose invocation, and let compose apply the full desired
 * state — it recreates `aethera-app` with correct networking, ports and overlay,
 * and pulls the new tag. The flag is EXPERIMENTAL.
 *
 * If the panel isn't compose-managed (labels missing) we DO NOT hand-recreate —
 * we fall through to the safe "image pulled, apply manually" return.
 *
 * With the flag unset (default) we also stop at "image pulled" and leave the
 * recreate to the operator (or their compose/run wrapper).
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
/** Detached one-shot helper that recreates the panel via docker compose (#20). */
const UPDATER_CONTAINER = "aethera-updater";

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
 *  4. If `AETHERA_SELF_UPDATE === "true"` (EXPERIMENTAL) and the panel is
 *     compose-managed: launch a detached `docker:cli` helper that runs
 *     `docker compose up -d <service>` (discovered from the panel's compose
 *     labels) to recreate `aethera-app` with full correct config, and return
 *     `{status:"updating", restarting:true}`. Otherwise return "pulled, apply
 *     manually" and leave the recreate to the operator.
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
  // Compose-delegation pattern: a process can't cleanly recreate the very
  // container it runs in, so under AETHERA_SELF_UPDATE we launch a DETACHED
  // one-shot helper container (`aethera-updater`, from `docker:cli`) that
  // outlives the old panel and runs `docker compose up -d <service>`. We never
  // hand-recreate via dockerode (that loses compose-managed networking — the
  // tunnel-resolved `app` alias, port bindings, the tunnel overlay — and leaves
  // the panel unreachable). Instead we read Compose v2's labels off the live
  // `aethera-app` container to reproduce its exact compose invocation, and let
  // compose apply the full desired state (recreate with correct config + pull).
  const selfUpdate = process.env.AETHERA_SELF_UPDATE === "true";

  if (selfUpdate) {
    // Discover how compose manages the panel from the v2 labels it stamps.
    const info = await docker.getContainer(APP_CONTAINER).inspect();
    const labels = (info?.Config?.Labels ?? {}) as Record<string, string>;
    const workingDir = labels["com.docker.compose.project.working_dir"];
    const configFiles = (labels["com.docker.compose.project.config_files"] ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    const service = labels["com.docker.compose.service"];

    if (workingDir && configFiles.length > 0 && service) {
      log("self-update:compose-helper", {
        imageRef,
        workingDir,
        configFiles,
        service,
      });

      // Clear any stale helper from a previous run to avoid a name clash.
      await docker
        .getContainer(UPDATER_CONTAINER)
        .remove({ force: true })
        .catch(() => {});

      const updaterImage = process.env.AETHERA_UPDATER_IMAGE || "docker:cli";
      const composeFiles = configFiles.map((f) => `-f '${f}'`).join(" ");

      // createContainer does NOT auto-pull — a missing helper image fails with
      // 404 "no such image". Pull it first (cached after the first run).
      log("self-update:pulling-helper-image", { updaterImage });
      await pullImage(docker, updaterImage);

      const helper = await docker.createContainer({
        name: UPDATER_CONTAINER,
        // docker:cli bundles the compose v2 plugin.
        Image: updaterImage,
        WorkingDir: workingDir,
        // APP_TAG fallback so compose deploys the NEW tag even if .env lags.
        Env: [`APP_TAG=${imageTag}`],
        Labels: { "aethera.role": "updater" },
        // Wait for the API response to flush, sync the host .env to the new tag
        // (for future manual ops), then run the discovered compose command —
        // compose recreates `aethera-app` with full correct config and pulls.
        Cmd: [
          "sh",
          "-c",
          `sleep 2; sed -i 's|^APP_TAG=.*|APP_TAG=${imageTag}|' .env 2>/dev/null || true; docker compose ${composeFiles} up -d ${service}`,
        ],
        HostConfig: {
          // Mount the socket + the project dir at its real path so the compose
          // files and .env resolve exactly as on the host. No NetworkMode needed
          // — compose handles app networking.
          Binds: [
            "/var/run/docker.sock:/var/run/docker.sock",
            `${workingDir}:${workingDir}`,
          ],
          AutoRemove: true,
          RestartPolicy: { Name: "no" },
        },
      });
      await helper.start();

      log("self-update:helper-started", {
        imageRef,
        container: UPDATER_CONTAINER,
        service,
      });

      return {
        status: "updating",
        restarting: true,
        imageTag,
        message: `Recreating ${service} via docker compose; the panel will restart shortly.`,
      };
    }

    // Not compose-managed — DO NOT hand-recreate (would break networking).
    // Fall through to the safe pull-only manual return below.
    log("self-update:not-compose-managed", { imageRef });
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
