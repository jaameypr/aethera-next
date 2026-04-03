import "server-only";

import type { ContainerConfig } from "@pruefertit/docker-orchestrator";
import type { IServer } from "../db/models/server";
import { CONTAINER_PREFIX_MC, CONTAINER_PREFIX_HYT } from "./orchestrator";
import { getDockerType } from "@/lib/config/server-types";

/**
 * Deterministic container name from a server document.
 */
export function containerName(server: IServer): string {
  const prefix =
    server.runtime === "hytale" ? CONTAINER_PREFIX_HYT : CONTAINER_PREFIX_MC;
  return `${prefix}${server.identifier}`;
}

/**
 * Map IServer fields to itzg/minecraft-server environment variables.
 * Handles both legacy modLoader-based servers and new serverType-based ones,
 * including pack-driven types (CurseForge, Modrinth).
 */
export function serverEnvFromDoc(server: IServer): Record<string, string> {
  const env: Record<string, string> = {
    EULA: "TRUE",
  };

  // --- TYPE ---
  // serverType takes precedence over legacy modLoader
  const dockerType = getDockerType(server.serverType, server.modLoader);
  if (dockerType) env.TYPE = dockerType;

  // --- VERSION ---
  // For pack types, use the resolved MC version (not user-entered)
  const effectiveVersion = server.resolvedMinecraftVersion || server.version;
  if (effectiveVersion) env.VERSION = effectiveVersion;

  // --- Pack-specific env vars ---
  if (server.serverType === "curseforge" && server.packReference) {
    const cfKey = process.env.CURSEFORGE_API_KEY;
    if (cfKey) env.CF_API_KEY = cfKey;

    if (server.packReference.slug) env.CF_SLUG = server.packReference.slug;
    if (server.packReference.projectId) env.CF_PROJECT_ID = server.packReference.projectId;
    if (server.packReference.fileId) env.CF_FILE_ID = server.packReference.fileId;
    if (server.resolvedLoader) env.CF_MODPACK_LOADER = server.resolvedLoader.toUpperCase();
  }

  if (server.serverType === "modrinth" && server.packReference) {
    // itzg requires MODRINTH_MODPACK = slug | projectId | .mrpack URL
    const modpack =
      server.packReference.mrpackUrl ||
      server.packReference.projectId ||
      server.packReference.slug;
    if (modpack) env.MODRINTH_MODPACK = modpack;
    // Optional: pin a specific version
    if (server.packReference.versionId) env.MODRINTH_VERSION = server.packReference.versionId;
    // Download optional dependencies (mods required by the pack)
    env.MODRINTH_DOWNLOAD_DEPENDENCIES = "required";
  }

  // --- Additional mods (panel-managed overlays, re-applied on every start) ---
  if (server.additionalMods?.length) {
    const modrinthExtra = server.additionalMods.filter((m) => m.source === "modrinth");
    const cfExtra = server.additionalMods.filter((m) => m.source === "curseforge");

    if (modrinthExtra.length) {
      // MODRINTH_PROJECTS: comma-separated "projectId[:versionId]"
      env.MODRINTH_PROJECTS = modrinthExtra
        .map((m) => (m.versionId ? `${m.projectId}:${m.versionId}` : m.projectId))
        .join(",");
    }
    if (cfExtra.length) {
      // CURSEFORGE_FILES: pipe-separated "projectId[:fileId]"
      env.CURSEFORGE_FILES = cfExtra
        .map((m) => (m.fileId ? `${m.projectId}:${m.fileId}` : m.projectId))
        .join("|");
    }
  }

  // --- Exclusions (declarative, re-applied on every start — database is source of truth) ---
  if (server.excludedPackMods?.length) {
    const normal = server.excludedPackMods.filter((m) => !m.isOverride);
    const overrides = server.excludedPackMods.filter((m) => m.isOverride);

    if (server.serverType === "curseforge") {
      const normalTokens = normal.map((m) => m.cfExcludeToken).filter(Boolean);
      const overrideTokens = overrides.map((m) => m.cfExcludeToken).filter(Boolean);
      if (normalTokens.length) env.CF_EXCLUDE_MODS = normalTokens.join(",");
      if (overrideTokens.length) env.CF_OVERRIDES_EXCLUSIONS = overrideTokens.join(",");
    } else if (server.serverType === "modrinth") {
      const normalTokens = normal.map((m) => m.filenameToken).filter(Boolean);
      const overrideTokens = overrides.map((m) => m.filenameToken).filter(Boolean);
      if (normalTokens.length) env.MODRINTH_EXCLUDE_FILES = normalTokens.join(",");
      if (overrideTokens.length) env.MODRINTH_OVERRIDES_EXCLUSIONS = overrideTokens.join(",");
    }
  }

  // --- Loader version (Forge/Fabric) ---
  if (server.resolvedLoaderVersion) {
    if (server.serverType === "forge" || server.modLoader === "forge") {
      env.FORGE_VERSION = server.resolvedLoaderVersion;
    } else if (server.serverType === "fabric" || server.modLoader === "fabric") {
      env.FABRIC_LOADER_VERSION = server.resolvedLoaderVersion;
    }
  }

  // --- Resources ---
  if (server.memory) env.MEMORY = `${server.memory}M`;
  if (server.port) env.SERVER_PORT = String(server.port);

  if (server.rconPort) {
    env.RCON_PORT = String(server.rconPort);
    env.ENABLE_RCON = "true";
  }

  if (server.javaArgs) env.JVM_XX_OPTS = server.javaArgs;

  // --- User-defined env vars (override defaults) ---
  if (server.env) {
    if (server.env instanceof Map) {
      server.env.forEach((value, key) => {
        env[key] = String(value);
      });
    } else {
      Object.assign(env, server.env);
    }
  }

  return env;
}

/**
 * Build a full ContainerConfig from a server document and a host data directory.
 */
export function deployConfigFromDoc(
  server: IServer,
  dataDir: string,
): ContainerConfig {
  const ports: ContainerConfig["ports"] = [
    { container: server.port, host: server.port, protocol: "tcp" as const },
  ];

  if (server.rconPort) {
    ports.push({
      container: server.rconPort,
      host: server.rconPort,
      protocol: "tcp" as const,
    });
  }

  return {
    preset: server.runtime === "hytale" ? "hytale" : "minecraft",
    name: containerName(server),
    image: server.image,
    // For itzg, use java{n} tag to select the correct JDK bundled in that image variant
    tag: (server.image === "itzg/minecraft-server" && server.javaVersion)
      ? `java${server.javaVersion}`
      : server.tag,
    env: serverEnvFromDoc(server),
    ports,
    mounts: [
      {
        type: "bind" as const,
        source: dataDir,
        target: "/data",
        readOnly: false,
      },
    ],
    labels: {
      "aethera.type": server.runtime,
      "aethera.identifier": server.identifier,
      "aethera.project": server.projectKey,
    },
    restartPolicy: "unless-stopped",
    resources: {
      // JVM needs headroom beyond -Xmx for metaspace, native memory, GC, etc.
      memory: { limit: `${server.memory + 1024}m` },
    },
    stopTimeout: 30,
    interactive: true,
  };
}
