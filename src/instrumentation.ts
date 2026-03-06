export async function register() {
  // Only seed on the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seed } = await import("@/lib/db/seed");
      await seed();
    } catch (error) {
      console.error("[instrumentation] Seed failed:", error);
    }
  }
}
