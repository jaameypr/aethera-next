import type { NextRequest } from "next/server";
import { verifyDiscordModuleApiKey } from "@/lib/services/discord-module.service";
import { consumeVerificationCode } from "@/lib/services/discord.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/discord/callback/verify
 *
 * Called by the Discord module when a user runs the /verify slash command.
 * The module sends the verification code alongside the Discord guild info;
 * Aethera validates the code and links the guild to the project.
 *
 * Secured by the Discord module's API key (Bearer token).
 *
 * Body: { code: string, guildId: string, guildName: string, guildIcon?: string }
 * Response (200): { projectName: string, projectKey: string }
 * Response (400): { error: string }  — invalid/expired code, or guild conflict
 * Response (401): { error: string }  — bad API key
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const authorized = await verifyDiscordModuleApiKey(token);
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: string; guildId?: string; guildName?: string; guildIcon?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, guildId, guildName, guildIcon } = body;

  if (!code || !guildId || !guildName) {
    return Response.json(
      { error: "code, guildId, and guildName are required" },
      { status: 400 },
    );
  }

  try {
    const project = await consumeVerificationCode(code, guildId, guildName, guildIcon);
    return Response.json({ projectName: project.name, projectKey: project.key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
