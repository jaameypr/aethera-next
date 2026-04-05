import type { NextRequest } from "next/server";
import { getServer, sendConsoleCommand } from "@/lib/services/server.service";
import { verifyDiscordModuleApiKey } from "@/lib/services/discord-module.service";
import { badRequest } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/discord/callback/command
 *
 * Called by the Discord module to execute a console command on a server.
 * Used for whitelist approvals: Discord bot button click → Aethera executes
 * `whitelist add <playerName>` on the Minecraft server.
 *
 * Secured by the Discord module's API key (Bearer token).
 * Relies on Docker-network isolation — this endpoint is NOT intended for
 * external access.
 *
 * Body: { serverId: string, command: string }
 */
export async function POST(req: NextRequest) {
  // Verify module API key
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const authorized = await verifyDiscordModuleApiKey(token);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { serverId?: string; command?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { serverId, command } = body;

  if (!serverId || !command) {
    return Response.json({ error: "serverId and command are required" }, { status: 400 });
  }

  // Allowlist: only accept safe whitelist commands to prevent command injection
  const allowedPattern = /^whitelist (add|remove) [a-zA-Z0-9_]{2,16}$/;
  if (!allowedPattern.test(command.trim())) {
    return Response.json(
      { error: "Only 'whitelist add/remove <player>' commands are permitted" },
      { status: 403 },
    );
  }

  const server = await getServer(serverId);
  if (!server) {
    return Response.json({ error: "Server not found" }, { status: 404 });
  }

  if (server.status !== "running") {
    return Response.json({ error: "Server is not running" }, { status: 409 });
  }

  await sendConsoleCommand(serverId, command.trim());

  return Response.json({ success: true });
}
