import { describe, it, expect, vi, beforeEach } from "vitest";

// The standalone finisher is plain CommonJS (ships in the standalone image at
// /app/scripts/self-update-finish.js). We require it directly and exercise the
// testable recreateApp() with a hand-built mock dockerode client — no real
// daemon is ever touched.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recreateApp } = require("../../../scripts/self-update-finish") as {
  recreateApp: (
    docker: unknown,
    opts: {
      appName: string;
      targetImage: string;
      verifyMs?: number;
      settleMs?: number;
      pollMs?: number;
    },
  ) => Promise<{ ok: boolean; rolledBack: boolean }>;
};

const APP = "aethera-app";
const PREV = "aethera-app-prev";
const NEW_IMAGE = "ghcr.io/jaameypr/aethera-next:0.3.0";

interface FakeContainer {
  id: string;
  inspect: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

/** Inspect payload that mirrors what dockerode returns for the live panel. */
function baseInspect() {
  return {
    Id: "oldcontainerid0000",
    Config: {
      Env: ["FOO=bar", "AETHERA_SELF_UPDATE=true"],
      Labels: { "com.docker.compose.project": "aethera" },
      ExposedPorts: { "3000/tcp": {} },
      Cmd: ["node", "server.js"],
      Entrypoint: ["docker-entrypoint.sh"],
    },
    HostConfig: {
      Binds: ["/var/run/docker.sock:/var/run/docker.sock"],
      PortBindings: { "3000/tcp": [{ HostPort: "3000" }] },
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: "aethera-net",
      Memory: 1073741824,
    },
    NetworkSettings: {
      Networks: {
        "aethera-net": { Aliases: ["aethera-app", "oldcontaine"] },
        "edge-net": { Aliases: ["panel"] },
      },
    },
    State: { Running: true, Restarting: false },
  };
}

/**
 * Build a mock docker client. `newContainerOverrides` lets a test make the
 * freshly created container misbehave (e.g. start() rejects) to drive rollback.
 */
function makeDocker(opts: {
  newContainerStartRejects?: boolean;
  newContainerInspectState?: { Running: boolean; Restarting: boolean };
}) {
  const containers = new Map<string, FakeContainer>();

  const oldContainer: FakeContainer = {
    id: "oldcontainerid0000",
    inspect: vi.fn().mockResolvedValue(baseInspect()),
    stop: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  containers.set(APP, oldContainer);

  const newContainer: FakeContainer = {
    id: "newcontainerid1111",
    inspect: vi.fn().mockResolvedValue({
      State: opts.newContainerInspectState ?? {
        Running: true,
        Restarting: false,
      },
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    start: opts.newContainerStartRejects
      ? vi.fn().mockRejectedValue(new Error("boom: new container won't start"))
      : vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };

  // When the old container is renamed to PREV, register it under the new name.
  oldContainer.rename.mockImplementation(async ({ name }: { name: string }) => {
    containers.delete(APP);
    containers.set(name, oldContainer);
  });

  const createContainer = vi.fn().mockImplementation(async () => {
    // The new container becomes addressable under APP once created.
    containers.set(APP, newContainer);
    return newContainer;
  });

  // On rollback the new container is removed, then PREV renamed back to APP.
  newContainer.remove.mockImplementation(async () => {
    if (containers.get(APP) === newContainer) containers.delete(APP);
  });
  oldContainer.rename.mockImplementation(async ({ name }: { name: string }) => {
    const cur = [...containers.entries()].find(
      ([, c]) => c === oldContainer,
    )?.[0];
    if (cur) containers.delete(cur);
    containers.set(name, oldContainer);
  });

  const network = { connect: vi.fn().mockResolvedValue(undefined) };
  const getNetwork = vi.fn().mockReturnValue(network);

  const getContainer = vi.fn().mockImplementation((name: string) => {
    const existing = containers.get(name);
    if (existing) return existing;
    // Unknown names (e.g. PREV before rename) get a benign stub.
    return {
      id: `stub-${name}`,
      inspect: vi.fn().mockResolvedValue({ State: {} }),
      stop: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
  });

  return {
    docker: { getContainer, createContainer, getNetwork },
    oldContainer,
    newContainer,
    createContainer,
    getContainer,
    getNetwork,
    network,
  };
}

describe("recreateApp (self-update finisher)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("happy path: inspect → stop → rename(prev) → create(new image) → start → remove(prev)", async () => {
    const m = makeDocker({});

    const res = await recreateApp(m.docker, {
      appName: APP,
      targetImage: NEW_IMAGE,
      verifyMs: 200,
      settleMs: 5,
      pollMs: 5,
    });

    expect(res).toEqual({ ok: true, rolledBack: false });

    // Inspected the live container first.
    expect(m.oldContainer.inspect).toHaveBeenCalled();
    // Stopped it.
    expect(m.oldContainer.stop).toHaveBeenCalled();
    // Renamed the old one out of the way.
    expect(m.oldContainer.rename).toHaveBeenCalledWith({ name: PREV });
    // Created the replacement under the SAME name with the NEW image.
    expect(m.createContainer).toHaveBeenCalledTimes(1);
    const createArg = m.createContainer.mock.calls[0][0];
    expect(createArg.name).toBe(APP);
    expect(createArg.Image).toBe(NEW_IMAGE);
    // Started the new container.
    expect(m.newContainer.start).toHaveBeenCalled();
    // Removed the previous container after a successful verify.
    // (PREV is removed via getContainer(PREV).remove)
    const prevHandle = m.getContainer.mock.results
      .map((r) => r.value)
      .find((c) => c?.id === m.oldContainer.id);
    expect(prevHandle?.remove).toHaveBeenCalled();
  });

  it("carries the old config over to the new container (Env/Labels/HostConfig/networking)", async () => {
    const m = makeDocker({});

    await recreateApp(m.docker, {
      appName: APP,
      targetImage: NEW_IMAGE,
      verifyMs: 200,
      settleMs: 5,
      pollMs: 5,
    });

    const createArg = m.createContainer.mock.calls[0][0];
    expect(createArg.Env).toEqual(["FOO=bar", "AETHERA_SELF_UPDATE=true"]);
    expect(createArg.Labels).toMatchObject({
      "com.docker.compose.project": "aethera",
    });
    expect(createArg.ExposedPorts).toEqual({ "3000/tcp": {} });
    expect(createArg.Cmd).toEqual(["node", "server.js"]);
    expect(createArg.Entrypoint).toEqual(["docker-entrypoint.sh"]);
    expect(createArg.HostConfig).toMatchObject({
      Binds: ["/var/run/docker.sock:/var/run/docker.sock"],
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: "aethera-net",
    });

    // Networks other than the HostConfig.NetworkMode one are re-attached with
    // aliases (so cloudflared/compose DNS keeps resolving the panel).
    expect(m.getNetwork).toHaveBeenCalledWith("edge-net");
    expect(m.network.connect).toHaveBeenCalled();
    const connectArg = m.network.connect.mock.calls[0][0];
    expect(connectArg.Container).toBe(m.newContainer.id);
    expect(connectArg.EndpointConfig.Aliases).toContain("panel");
    // The primary network attached via NetworkMode is NOT double-attached.
    expect(m.getNetwork).not.toHaveBeenCalledWith("aethera-net");
  });

  it("rollback: when the new container fails to start, restore the previous one", async () => {
    const m = makeDocker({ newContainerStartRejects: true });

    const res = await recreateApp(m.docker, {
      appName: APP,
      targetImage: NEW_IMAGE,
      verifyMs: 200,
      settleMs: 5,
      pollMs: 5,
    });

    expect(res).toEqual({ ok: false, rolledBack: true });

    // The broken new container is removed.
    expect(m.newContainer.remove).toHaveBeenCalled();
    // The previous container is renamed back to the canonical app name…
    expect(m.oldContainer.rename).toHaveBeenCalledWith({ name: APP });
    // …and started again so the panel never stays down.
    expect(m.oldContainer.start).toHaveBeenCalled();
  });

  it("rollback: when verify times out (new container never settles), restore the previous one", async () => {
    const m = makeDocker({
      newContainerInspectState: { Running: false, Restarting: true },
    });

    const res = await recreateApp(m.docker, {
      appName: APP,
      targetImage: NEW_IMAGE,
      verifyMs: 60,
      settleMs: 5,
      pollMs: 10,
    });

    expect(res).toEqual({ ok: false, rolledBack: true });
    expect(m.newContainer.remove).toHaveBeenCalled();
    expect(m.oldContainer.rename).toHaveBeenCalledWith({ name: APP });
    expect(m.oldContainer.start).toHaveBeenCalled();
  });
});
