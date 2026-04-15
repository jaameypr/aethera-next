import "server-only";

import {
  createClient,
  createOrchestrator,
  definePreset,
  type ContainerConfig,
} from "@pruefertit/docker-orchestrator";
import type { Orchestrator } from "@pruefertit/docker-orchestrator";

export type { ContainerConfig };
export type DockerClient = Awaited<ReturnType<typeof createClient>>["docker"];

export const CONTAINER_PREFIX_MC = "aethera-mc-";

let _orchestrator: Orchestrator | null = null;
let _docker: DockerClient | null = null;
let _initPromise: Promise<void> | null = null;

async function init(): Promise<void> {
  if (_orchestrator) return;

  if (!_initPromise) {
    _initPromise = (async () => {
      const { docker } = await createClient();
      _docker = docker;

      const orch = createOrchestrator(docker, {
        defaultNetwork: "aethera-net",
      });

      // Minecraft preset — itzg/minecraft-server with log-based ready check
      orch.presets.register(
        definePreset({
          name: "minecraft",
          config: {
            image:
              process.env.AETHERA_MINECRAFT_IMAGE || "itzg/minecraft-server",
            tag: "stable",
            env: { EULA: "TRUE", TYPE: "VANILLA" },
            mounts: [],
            labels: { "aethera.type": "minecraft" },
          },
          readyCheck: {
            type: "log",
            match: "Done",
            timeout: 120_000,
          },
          gracefulStop: {
            command: "stop",
            waitForExit: true,
            timeout: 30_000,
          },
        }),
      );

      _orchestrator = orch;
    })();
  }

  await _initPromise;
}

export async function getOrchestrator(): Promise<Orchestrator> {
  await init();
  return _orchestrator!;
}

export async function getDockerClient(): Promise<DockerClient> {
  await init();
  return _docker!;
}
