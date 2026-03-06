import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  InteractionType,
  InteractionResponseType,
  ApplicationCommandType,
  type APIChatInputApplicationCommandInteraction,
  type APIInteraction,
} from "discord-api-types/v10";
import {
  consumeVerificationCode,
  notifyServerEvent,
  isDiscordConfigured,
} from "@/lib/services/discord.service";

// ---------------------------------------------------------------------------
// Ed25519 signature verification
// ---------------------------------------------------------------------------

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? "";

async function verifySignature(
  body: string,
  signature: string,
  timestamp: string,
): Promise<boolean> {
  if (!DISCORD_PUBLIC_KEY) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(DISCORD_PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"],
    );

    const msg = new TextEncoder().encode(timestamp + body);
    const sig = hexToUint8Array(signature);

    return crypto.subtle.verify("Ed25519", key, sig, msg);
  } catch {
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleVerifyCommand(
  interaction: APIChatInputApplicationCommandInteraction,
): Promise<object> {
  const codeOption = interaction.data.options?.find(
    (o) => o.name === "code",
  );
  if (!codeOption || !("value" in codeOption) || typeof codeOption.value !== "string") {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "❌ Bitte gib einen Verifizierungscode an.",
        flags: 64, // EPHEMERAL
      },
    };
  }

  const guild = interaction.guild_id;
  // Guild name isn't directly available in interactions; use guild_id as fallback
  const guildName =
    (interaction as unknown as { guild?: { name?: string } }).guild?.name ??
    guild ??
    "Unknown Guild";

  if (!guild) {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content: "❌ Dieser Befehl kann nur in einem Server verwendet werden.",
        flags: 64,
      },
    };
  }

  try {
    const project = await consumeVerificationCode(
      codeOption.value,
      guild,
      guildName,
    );

    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        embeds: [
          {
            title: "✅ Verifizierung erfolgreich!",
            description: `Dieser Discord-Server wurde mit dem Projekt **${project.name}** (\`${project.key}\`) verknüpft.`,
            color: 0x22c55e,
          },
        ],
      },
    };
  } catch {
    return {
      type: InteractionResponseType.ChannelMessageWithSource,
      data: {
        content:
          "❌ Code ungültig oder abgelaufen. Erstelle einen neuen Code im Dashboard.",
        flags: 64,
      },
    };
  }
}

async function handleStatusCommand(
  interaction: APIChatInputApplicationCommandInteraction,
): Promise<object> {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: "🤖 Aethera Bot",
          description: "Der Bot ist online und bereit.",
          color: 0x6366f1,
          fields: [
            {
              name: "Guild",
              value: interaction.guild_id ?? "DM",
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  if (!isDiscordConfigured() || !DISCORD_PUBLIC_KEY) {
    return NextResponse.json(
      { error: "Discord integration not configured" },
      { status: 503 },
    );
  }

  const body = await req.text();
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";

  const valid = await verifySignature(body, signature, timestamp);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body) as APIInteraction;

  // Ping verification (required by Discord)
  if (interaction.type === InteractionType.Ping) {
    return NextResponse.json({ type: InteractionResponseType.Pong });
  }

  // Application commands
  if (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.data.type === ApplicationCommandType.ChatInput
  ) {
    const cmd = interaction as APIChatInputApplicationCommandInteraction;

    let response: object;
    switch (cmd.data.name) {
      case "verify":
        response = await handleVerifyCommand(cmd);
        break;
      case "status":
        response = await handleStatusCommand(cmd);
        break;
      default:
        response = {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: "❓ Unbekannter Befehl.", flags: 64 },
        };
    }

    return NextResponse.json(response);
  }

  return NextResponse.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "❓ Nicht unterstützte Interaktion.", flags: 64 },
  });
}

export const dynamic = "force-dynamic";
