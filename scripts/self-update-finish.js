'use strict';
/**
 * self-update-finish.js — Standalone Node.js helper that recreates the panel
 * container onto a freshly pulled image (#20).
 *
 * THE PATTERN: a process cannot cleanly recreate the very container it runs in.
 * So `runUpdate()` (app-update.service.ts), after pulling the new image, launches
 * THIS script as a *detached one-shot helper container started from the NEW
 * image* (`aethera-updater`). That helper therefore already contains node +
 * dockerode + this exact script, and — crucially — it OUTLIVES the old panel:
 * it can stop/rename/recreate `aethera-app` without killing itself.
 *
 * SAFETY (rename-based rollback): we never `docker rm -f aethera-app` and hope.
 * Instead we rename the live container to `aethera-app-prev`, create the new one
 * under the canonical name, start + verify it, and only then delete the previous
 * one. If anything throws or the new container never settles, we remove the new
 * one, rename `-prev` back to `aethera-app` and start it again — the panel is
 * never left without a running `aethera-app`.
 *
 * Invoked as:
 *   node /app/scripts/self-update-finish.js <appName> <targetImage>
 * (appName defaults to `aethera-app`; targetImage also read from
 * AETHERA_UPDATE_IMAGE env as a fallback.)
 *
 * No IPC: the triggering API has already returned by the time we act.
 */

// dockerode ships in the image (transitively via @pruefertit/docker-orchestrator).
// Prefer the direct dependency; fall back to resolving it through the
// orchestrator package if the direct require ever fails.
let Docker;
try {
  Docker = require('dockerode');
} catch {
  Docker = require('@pruefertit/docker-orchestrator/node_modules/dockerode');
}

const APP_DEFAULT = 'aethera-app';

function log(step, details) {
  if (details === undefined) console.log(`[self-update] ${step}`);
  else console.log(`[self-update] ${step}`, JSON.stringify(details));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll the new container until it reports Running && !Restarting for two
 * consecutive checks, or `verifyMs` elapses. Returns true on success.
 */
async function verifyRunning(container, verifyMs, pollMs) {
  const deadline = Date.now() + verifyMs;
  let consecutive = 0;
  while (Date.now() < deadline) {
    let state;
    try {
      const info = await container.inspect();
      state = info && info.State;
    } catch {
      state = null;
    }
    if (state && state.Running === true && state.Restarting === false) {
      consecutive += 1;
      if (consecutive >= 2) return true;
    } else {
      consecutive = 0;
    }
    await sleep(pollMs);
  }
  return false;
}

/**
 * Recreate `appName` onto `targetImage`, carrying over the full runtime config
 * of the live container. SAFE: rename-based rollback on any failure.
 *
 * @returns {Promise<{ok: boolean, rolledBack: boolean}>}
 */
async function recreateApp(docker, opts) {
  const appName = opts.appName || APP_DEFAULT;
  const targetImage = opts.targetImage;
  const verifyMs = opts.verifyMs == null ? 15000 : opts.verifyMs;
  const pollMs = opts.pollMs == null ? 1000 : opts.pollMs;
  const settleMs = opts.settleMs == null ? 1000 : opts.settleMs;
  const prevName = `${appName}-prev`;

  // 1) Inspect the live container.
  const app = docker.getContainer(appName);
  const info = await app.inspect();
  log('inspected', { appName, image: targetImage });

  const config = info.Config || {};
  const hostConfig = info.HostConfig || {};
  const networks =
    (info.NetworkSettings && info.NetworkSettings.Networks) || {};
  const shortId = info.Id ? info.Id.slice(0, 12) : '';

  let renamedToPrev = false;
  let created = null;

  try {
    // 3) Stop the live container (best-effort; tolerate already-stopped).
    await app.stop({ t: 30 }).catch(() => {});
    log('stopped', { appName });

    // 4) Rename it out of the way so the new one can take the canonical name.
    await app.rename({ name: prevName });
    renamedToPrev = true;
    log('renamed-prev', { from: appName, to: prevName });

    // 5) Create the replacement: SAME config, NEW image, SAME name.
    created = await docker.createContainer({
      name: appName,
      Image: targetImage,
      Env: config.Env,
      Labels: config.Labels,
      ExposedPorts: config.ExposedPorts,
      Cmd: config.Cmd,
      Entrypoint: config.Entrypoint,
      HostConfig: hostConfig,
    });
    log('created', { appName, image: targetImage, id: created.id });

    // 6) Re-attach the non-primary networks WITH their aliases so service
    //    discovery (cloudflared/compose) keeps resolving the panel. The network
    //    referenced by HostConfig.NetworkMode is already attached at create time
    //    — skip it to avoid a double-attach error.
    const primaryNetwork = hostConfig.NetworkMode;
    for (const [netName, netCfg] of Object.entries(networks)) {
      if (netName === primaryNetwork) continue;
      try {
        const aliases = ((netCfg && netCfg.Aliases) || []).filter(
          (a) => a !== shortId,
        );
        await docker.getNetwork(netName).connect({
          Container: created.id,
          EndpointConfig: { Aliases: aliases },
        });
        log('network-attached', { network: netName, aliases });
      } catch (err) {
        log('network-attach-failed', {
          network: netName,
          error: err && err.message ? err.message : String(err),
        });
      }
    }

    // 7) Start it.
    await created.start();
    log('started', { appName, id: created.id });

    // 8) Verify it stays up.
    await sleep(settleMs);
    const healthy = await verifyRunning(created, verifyMs, pollMs);
    if (!healthy) throw new Error('new container failed verification');
    log('verified', { appName });

    // 9) Success — drop the previous container.
    await docker
      .getContainer(prevName)
      .remove({ force: true })
      .catch(() => {});
    log('removed-prev', { prevName });

    return { ok: true, rolledBack: false };
  } catch (err) {
    log('failure', { error: err && err.message ? err.message : String(err) });

    // 10) ROLLBACK — never leave the panel without a running aethera-app.
    // Remove the (broken) new container if we got as far as creating it.
    try {
      if (created) {
        await docker
          .getContainer(appName)
          .remove({ force: true })
          .catch(() => {});
        log('rollback:removed-new', { appName });
      }
    } catch {
      /* best-effort */
    }

    if (renamedToPrev) {
      try {
        const prev = docker.getContainer(prevName);
        await prev.rename({ name: appName });
        await prev.start().catch(() => {});
        log('rollback:restored-prev', { appName });
      } catch (rbErr) {
        log('rollback:FAILED', {
          error: rbErr && rbErr.message ? rbErr.message : String(rbErr),
        });
      }
    }

    return { ok: false, rolledBack: true };
  }
}

async function main() {
  const appName = process.argv[2] || process.env.AETHERA_APP_NAME || APP_DEFAULT;
  const targetImage = process.argv[3] || process.env.AETHERA_UPDATE_IMAGE;

  if (!targetImage) {
    console.error('[self-update] Usage: node self-update-finish.js <appName> <targetImage>');
    process.exit(1);
  }

  const docker = new Docker();

  // Give the triggering API call time to return its response before we tear the
  // old panel down.
  await sleep(3000);

  log('begin', { appName, targetImage });
  let result;
  try {
    result = await recreateApp(docker, { appName, targetImage });
  } catch (err) {
    console.error('[self-update] unexpected error:', err);
    process.exit(1);
  }

  log('done', result);
  process.exit(result.ok ? 0 : 1);
}

module.exports = { recreateApp };

// Only auto-run when executed directly (not when require()'d by tests).
if (require.main === module) {
  main();
}
