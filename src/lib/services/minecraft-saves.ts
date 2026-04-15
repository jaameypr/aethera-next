import "server-only";

import { sendConsoleCommand } from "@/lib/services/server.service";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pauses Minecraft's automatic disk-saves and forces a full world flush to disk.
 * Must be called only when the server is running (`sendConsoleCommand` throws otherwise).
 * Throws on failure — the caller must abort the backup if this throws.
 *
 * Note: save-off / save-all flush protect only Minecraft world data.
 * Plugin JARs, config files, and other static assets are not quiesced; they
 * are expected to be stable at runtime and are safe to copy concurrently.
 */
export async function issueMinecraftSaveOff(serverId: string): Promise<void> {
  await sendConsoleCommand(serverId, "save-off");
  await sleep(300);
  await sendConsoleCommand(serverId, "save-all flush");
  // Allow the chunk flush to propagate to disk before the backup reads files.
  await sleep(2000);
}

/**
 * Re-enables Minecraft's automatic disk-saves.
 * Safe to call even if the server has since stopped — any error is logged and
 * swallowed so save-on can never crash the backup pipeline.
 */
export async function issueMinecraftSaveOn(serverId: string): Promise<void> {
  try {
    await sendConsoleCommand(serverId, "save-on");
  } catch {
    // Server may have stopped (or restarted) while the backup was running — fine.
    console.warn(
      `[minecraft-saves] Could not re-enable auto-save on server ${serverId}; ` +
        "the server may have stopped or already restarted with saves enabled.",
    );
  }
}
