import type { ContainerConfig } from "@pruefertit/docker-orchestrator";
import type { IServer } from "../db/models/server";
import { CONTAINER_PREFIX_MC, CONTAINER_PREFIX_HYT } from "./orchestrator";

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
 */
export function serverEnvFromDoc(server: IServer): Record<string, string> {
  const env: Record<string, string> = {
    EULA: "TRUE",
  };

  if (server.version) {
    env.VERSION = server.version;
  }

  if (server.modLoader) {
    env.TYPE = server.modLoader.toUpperCase();
  }

  if (server.memory) {
    env.MEMORY = `${server.memory}M`;
  }

  if (server.port) {
    env.SERVER_PORT = String(server.port);
  }

  if (server.rconPort) {
    env.RCON_PORT = String(server.rconPort);
    env.ENABLE_RCON = "true";
  }

  if (server.javaArgs) {
    env.JVM_XX_OPTS = server.javaArgs;
  }

  // Merge user-defined env vars (override defaults)
  if (server.env) {
    Object.assign(env, server.env);
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
    tag: server.tag,
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
      memory: { limit: `${server.memory}m` },
    },
    stopTimeout: 30,
  };
}
