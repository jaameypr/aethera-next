import { describe, it, expect, vi } from "vitest";

// Mock the orchestrator module internals — we test helpers in isolation
vi.mock("@/lib/docker/orchestrator", () => ({
  CONTAINER_PREFIX_MC: "aethera-mc-",
  getOrchestrator: vi.fn(),
  getDockerClient: vi.fn(),
}));

vi.mock("@pruefertit/docker-orchestrator", () => ({
  createClient: vi.fn(),
  createOrchestrator: vi.fn(),
  definePreset: vi.fn((input: unknown) => input),
}));

import {
  CONTAINER_PREFIX_MC,
} from "@/lib/docker/orchestrator";
import { containerName, serverEnvFromDoc } from "@/lib/docker/helpers";

// ---------------------------------------------------------------------------
// containerName
// ---------------------------------------------------------------------------

describe("containerName", () => {
  it("prefixes minecraft servers with aethera-mc-", () => {
    const server = { runtime: "minecraft", projectKey: "proj", identifier: "survival" } as Parameters<typeof containerName>[0];
    expect(containerName(server)).toBe("aethera-mc-proj-survival");
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("CONTAINER_PREFIX constants", () => {
  it("has correct minecraft prefix", () => {
    expect(CONTAINER_PREFIX_MC).toBe("aethera-mc-");
  });
});

// ---------------------------------------------------------------------------
// serverEnvFromDoc
// ---------------------------------------------------------------------------

describe("serverEnvFromDoc", () => {
  it("maps server fields to itzg env vars", () => {
    const server = {
      version: "1.20.4",
      modLoader: "paper",
      memory: 4096,
      rconPort: 25575,
      port: 25565,
      env: {},
    } as Parameters<typeof serverEnvFromDoc>[0];

    const env = serverEnvFromDoc(server);

    expect(env.VERSION).toBe("1.20.4");
    expect(env.TYPE).toBe("PAPER");
    expect(env.MEMORY).toContain("4096");
    expect(env.EULA).toBe("TRUE");
  });

  it("defaults to latest version when not specified", () => {
    const server = {
      modLoader: "vanilla",
      memory: 2048,
      port: 25565,
      env: {},
    } as Parameters<typeof serverEnvFromDoc>[0];

    const env = serverEnvFromDoc(server);
    expect(env.EULA).toBe("TRUE");
    // VERSION should either be undefined or "latest"
    expect(!env.VERSION || env.VERSION === "latest").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// serverEnvFromDoc — NeoForge & Quilt loaders
// ---------------------------------------------------------------------------

describe("serverEnvFromDoc — NeoForge & Quilt loaders", () => {
  it("maps neoforge to TYPE=NEOFORGE with NEOFORGE_VERSION", () => {
    const server = {
      serverType: "neoforge",
      version: "1.21.1",
      resolvedLoaderVersion: "21.1.66",
      memory: 4096,
      port: 25565,
      env: {},
    } as Parameters<typeof serverEnvFromDoc>[0];

    const env = serverEnvFromDoc(server);

    expect(env.TYPE).toBe("NEOFORGE");
    expect(env.NEOFORGE_VERSION).toBe("21.1.66");
  });

  it("maps quilt to TYPE=QUILT with QUILT_LOADER_VERSION", () => {
    const server = {
      serverType: "quilt",
      version: "1.21.1",
      resolvedLoaderVersion: "0.26.0",
      memory: 4096,
      port: 25565,
      env: {},
    } as Parameters<typeof serverEnvFromDoc>[0];

    const env = serverEnvFromDoc(server);

    expect(env.TYPE).toBe("QUILT");
    expect(env.QUILT_LOADER_VERSION).toBe("0.26.0");
  });

  it("omits loader-version env when none is set (auto-latest)", () => {
    const neoforge = serverEnvFromDoc({
      serverType: "neoforge", version: "1.21.1", memory: 2048, port: 25565, env: {},
    } as Parameters<typeof serverEnvFromDoc>[0]);
    expect(neoforge.TYPE).toBe("NEOFORGE");
    expect(neoforge.NEOFORGE_VERSION).toBeUndefined();

    const quilt = serverEnvFromDoc({
      serverType: "quilt", version: "1.21.1", memory: 2048, port: 25565, env: {},
    } as Parameters<typeof serverEnvFromDoc>[0]);
    expect(quilt.TYPE).toBe("QUILT");
    expect(quilt.QUILT_LOADER_VERSION).toBeUndefined();
  });
});
