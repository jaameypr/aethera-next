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
    const server = { runtime: "minecraft", identifier: "survival" } as Parameters<typeof containerName>[0];
    expect(containerName(server)).toBe("aethera-mc-survival");
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
