export async function register() {
  // Only seed on the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seed } = await import("@/lib/db/seed");
      await seed();
    } catch (error) {
      console.error("[instrumentation] Seed failed:", error);
    }

    try {
      const { resetStuckJobs } = await import("@/lib/workers/backup-runner");
      await resetStuckJobs();
    } catch (error) {
      console.error("[instrumentation] resetStuckJobs failed:", error);
    }

    try {
      const { startEventListener } = await import("@/lib/docker/event-listener");
      await startEventListener();
    } catch (error) {
      console.error("[instrumentation] startEventListener failed:", error);
    }

    try {
      const { getUpdateStatus } = await import("@/lib/services/app-version.service");
      const s = await getUpdateStatus();
      if (s.updateAvailable) {
        console.warn(`[aethera] ⬆ Update available: ${s.current} → ${s.latest} (${s.channel}). Update via Admin → System.`);
      } else {
        console.log(`[aethera] Version ${s.current} is up to date.`);
      }
    } catch (error) {
      console.error("[instrumentation] version check failed:", error);
    }
  }
}
