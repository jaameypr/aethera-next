/**
 * Standalone Discord bot process.
 *
 * Run: npx tsx scripts/discord-bot.ts
 * Or deploy as a separate container with: node --loader tsx scripts/discord-bot.ts
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN    — Bot token from Discord Developer Portal
 *   DISCORD_APP_ID       — Application ID
 *   MONGODB_URI          — MongoDB connection string (same as main app)
 *
 * This script:
 *   1. Registers slash commands on startup
 *   2. Listens for interactions (if not using webhook mode)
 *   3. Can run as a long-lived process for presence/activity updates
 *
 * NOTE: If you use the webhook-based interactions endpoint
 *       (src/app/api/discord/interactions/route.ts), this script is only
 *       needed for registering commands and optional presence features.
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_API = "https://discord.com/api/v10";

if (!DISCORD_BOT_TOKEN || !DISCORD_APP_ID) {
  console.error(
    "❌ Missing DISCORD_BOT_TOKEN or DISCORD_APP_ID environment variables",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Slash command definitions
// ---------------------------------------------------------------------------

const COMMANDS = [
  {
    name: "verify",
    description: "Verknüpfe diesen Discord-Server mit einem Aethera-Projekt",
    options: [
      {
        name: "code",
        description: "Der Verifizierungscode aus dem Aethera-Dashboard",
        type: 3, // STRING
        required: true,
      },
    ],
  },
  {
    name: "status",
    description: "Zeige den Bot-Status an",
  },
  {
    name: "servers",
    description: "Liste alle Server des verknüpften Projekts",
  },
  {
    name: "start",
    description: "Starte einen Minecraft-Server",
    options: [
      {
        name: "server",
        description: "Server-Name oder Identifier",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "stop",
    description: "Stoppe einen Minecraft-Server",
    options: [
      {
        name: "server",
        description: "Server-Name oder Identifier",
        type: 3,
        required: true,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Register commands
// ---------------------------------------------------------------------------

async function registerCommands() {
  console.log("📝 Registering slash commands...");

  const res = await fetch(
    `${DISCORD_API}/applications/${DISCORD_APP_ID}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(COMMANDS),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ Failed to register commands: ${res.status} ${err}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`✅ Registered ${data.length} commands`);
}

// ---------------------------------------------------------------------------
// Gateway connection (optional — for presence/rich features)
// ---------------------------------------------------------------------------

async function connectGateway() {
  // Get gateway URL
  const gatewayRes = await fetch(`${DISCORD_API}/gateway/bot`, {
    headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
  });

  if (!gatewayRes.ok) {
    console.error("❌ Failed to get gateway URL");
    process.exit(1);
  }

  const { url } = await gatewayRes.json();
  console.log(`🔌 Connecting to gateway: ${url}`);

  const ws = new WebSocket(`${url}?v=10&encoding=json`);
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let sequence: number | null = null;

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(String(event.data));
    sequence = data.s ?? sequence;

    switch (data.op) {
      case 10: {
        // Hello — start heartbeating
        const interval = data.d.heartbeat_interval;
        heartbeatInterval = setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d: sequence }));
        }, interval);

        // Identify
        ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token: DISCORD_BOT_TOKEN,
              intents: 0, // No privileged intents needed for slash commands
              properties: {
                os: "linux",
                browser: "aethera",
                device: "aethera",
              },
              presence: {
                activities: [
                  { name: "Minecraft Servers", type: 3 }, // WATCHING
                ],
                status: "online",
              },
            },
          }),
        );
        break;
      }

      case 0: {
        // Dispatch
        if (data.t === "READY") {
          console.log(
            `✅ Bot online as ${data.d.user.username}#${data.d.user.discriminator}`,
          );
          console.log(`   Guilds: ${data.d.guilds.length}`);
        }
        break;
      }

      case 1: {
        // Heartbeat request
        ws.send(JSON.stringify({ op: 1, d: sequence }));
        break;
      }

      case 11: {
        // Heartbeat ACK — all good
        break;
      }
    }
  });

  ws.addEventListener("close", (event) => {
    console.log(
      `⚠️ WebSocket closed: ${event.code} ${event.reason}`,
    );
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    // Reconnect after delay
    setTimeout(() => {
      console.log("🔄 Reconnecting...");
      connectGateway();
    }, 5000);
  });

  ws.addEventListener("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🤖 Aethera Discord Bot starting...");

  await registerCommands();

  const useGateway = process.argv.includes("--gateway");

  if (useGateway) {
    console.log("🔌 Starting gateway connection for presence...");
    await connectGateway();
  } else {
    console.log(
      "ℹ️  Running in webhook mode. Use --gateway flag for presence features.",
    );
    console.log("✅ Commands registered. Bot is ready for webhook interactions.");
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
