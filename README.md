<div align="center">
  <h1>⚡ Aethera</h1>
  <p>Self-hosted game server management panel — built with Next.js, MongoDB, and Docker.</p>
</div>

---

## Overview

Aethera is a full-featured, self-hosted control panel for managing game servers. It organises servers into **projects**, enforces fine-grained **role-based permissions**, and talks directly to the Docker daemon to spin up, monitor, and control containers — no SSH required.

---

## Features

### 🗂️ Projects
- Group any number of servers under a named project with a unique short key
- Invite team members and assign project-level roles
- Per-project audit log tracking every significant action

### 👥 Role-Based Access Control
| Role | Project management | Server control | Blueprints | View only |
|------|--------------------|----------------|------------|-----------|
| **Owner** | ✅ Full | ✅ Full | ✅ | ✅ |
| **Admin** | ✅ | ✅ Full | ✅ | ✅ |
| **Manager** | ❌ | ✅ start/stop/console/files/backups | ✅ initialize | ✅ |
| **Viewer** | ❌ | ❌ | ❌ | ✅ |

Server-level permissions (`server.start`, `server.stop`, `server.console`, `server.files`, `server.backups`, `server.settings`) are auto-provisioned on member invite and can be fine-tuned individually.

### 🖥️ Server Management
- **Full lifecycle control** — create, start, stop, soft-stop, recreate, delete
- **Real-time console** — send commands and stream live log output
- **Live metrics** — CPU and memory usage streamed from Docker stats
- **Server status polling** — stopped / starting / running / stopping / error
- **Auto-start** — flag a server to start automatically with the panel
- **Custom Java args** — pass arbitrary JVM flags per server
- **`server.properties` editor** — edit all Minecraft server properties in-panel
- **Environment variable overrides** — set any Docker env var directly

### 🎮 Server Types
| Type | Category | Pack-driven |
|------|----------|-------------|
| Vanilla | Vanilla-like | — |
| Paper | Vanilla-like | — |
| Spigot | Vanilla-like | — |
| Purpur | Vanilla-like | — |
| Forge | Modded | — |
| Fabric | Modded | — |
| CurseForge | Pack | ✅ |
| Modrinth | Pack | ✅ |
| Hytale | Other | — |

Pack-driven servers resolve Minecraft version, loader, and loader version automatically from pack metadata.

### 📦 Mod & Content Management
- **Additional mods** — add mods from Modrinth or CurseForge on top of any pack server; they are injected via `MODRINTH_PROJECTS` / `CURSEFORGE_FILES` on every start
- **Exclude pack mods** — suppress specific mods bundled with a modpack without modifying the pack itself
- **Plugins** — dedicated endpoint for Bukkit/Spigot/Paper plugin management
- **Datapacks** — upload and manage vanilla datapacks per-world
- **.mrpack upload** — upload a Modrinth modpack file directly without needing a hosted URL

### 📐 Blueprints
- Create reusable **server templates** with a name and a RAM cap
- Managers and Admins can **initialize** a blueprint into a live server (capped at the blueprint's RAM limit)
- Once claimed, a blueprint links back to the created server
- Prevents unauthorized over-provisioning of resources

### 💾 Backup System
- **Selective component backups** — choose any combination of: `world`, `config`, `mods`, `plugins`, `datapacks`
- **Async jobs** — large backups run in a background worker process; the UI shows live progress
- **Download & restore** — download any backup as a `.tar.gz` archive or restore it in-place
- **Import backups** — import `.zip` or `.tar.gz` archives from external tools
- **Startup cleanup** — stuck async jobs are resolved automatically on panel restart

### 📁 File Manager
- Browse the full server data directory in-browser
- Read and write individual files without leaving the panel

### 🤝 Discord Integration
- **Admin setup** — set `DISCORD_BOT_TOKEN` in the environment and invite the bot to Discord once
- **Project linking** — a project manager generates a short-lived verification code in the panel, then uses it via the bot command in their Discord guild to link the project to that guild
- **Event notifications** — once linked, the bot posts server events (started, stopped, backup created, error) as embeds to a `#aethera` or `#server-status` channel, falling back to the first available text channel
- **Discord module** — optional Spring Boot bot that polls server logs and handles whitelist approval callbacks

### 🧩 Module System
- Install, start, stop, and remove Docker-based **add-on modules** from a remote registry
- Modules run on `aethera-net` alongside the panel and communicate internally
- **SSO** — short-lived JWTs (signed with `JWT_SECRET`) are passed to modules for authenticated callbacks
- **API key provisioning** — modules that declare `auth.strategy: api_key` receive an auto-generated key in their config
- **Paperview** — built-in integration for the Paperview file viewer module

### 🛡️ Admin Panel
- **User management** — create, enable/disable, and manage users
- **Role management** — define custom roles with granular permission sets
- **System metrics** — live host CPU and memory overview
- **Setup wizard** — first-run wizard to create the initial admin account without touching the CLI

### 🔐 Authentication
- Stateless **JWT** auth (access token 15 min, refresh token 7 days)
- Refresh tokens stored in the database and rotated on use
- Middleware-enforced route protection

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 15](https://nextjs.org) (App Router) |
| Language | TypeScript |
| Database | MongoDB 7 via Mongoose |
| Container orchestration | Docker (via `@pruefertit/docker-orchestrator`) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | JWT (access + refresh) |
| Theming | next-themes (dark / light) |
| Testing | Vitest |

---

## Deployment

### Prerequisites
- Docker & Docker Compose
- A host where the panel container can reach the Docker socket

### Quick Start

```bash
# 1. Copy and fill in the environment file
cp .env.example .env

# 2. Generate secrets (example using openssl)
openssl rand -hex 32   # → MONGO_PASS
openssl rand -hex 64   # → JWT_SECRET

# 3. Start the stack
docker compose up -d
```

The panel is available at `http://<host>:3000` (or `APP_PORT` if overridden).  
On first run, the setup wizard will guide you through creating the admin account.

### Key Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGO_PASS` | MongoDB root password |
| `JWT_SECRET` | Secret used to sign all JWTs |
| `AETHERA_DATA_DIR` | Host path for server data volumes |
| `AETHERA_BACKUP_DIR` | Host path for backup storage |
| `AETHERA_MINECRAFT_IMAGE` | Docker image for Minecraft servers (default: `itzg/minecraft-server`) |
| `DISCORD_BOT_TOKEN` | *(Optional)* Enable Discord integration |
| `CURSEFORGE_API_KEY` | *(Optional)* Enable CurseForge pack support |
| `MODULE_REGISTRY_URL` | *(Optional)* Remote URL for the module registry |

See `.env.example` for the full list.

---

## Development

```bash
npm install
npm run dev       # start dev server at http://localhost:3000
npm run build     # production build
npm test          # run Vitest test suite
```
