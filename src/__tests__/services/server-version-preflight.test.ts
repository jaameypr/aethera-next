import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const mockDeploy = vi.fn().mockResolvedValue({ containerId: "c-1", status: "running" });
vi.mock("@/lib/docker/orchestrator", () => ({
  getOrchestrator: vi.fn().mockResolvedValue({ deploy: mockDeploy, destroy: vi.fn() }),
  getDockerClient: vi.fn().mockResolvedValue({ getContainer: vi.fn() }),
  CONTAINER_PREFIX_MC: "aethera-mc-",
  CONTAINER_PREFIX_HYT: "aethera-hyt-",
}));
vi.mock("@pruefertit/docker-orchestrator", () => ({
  inspectContainer: vi.fn(),
  tailLogs: vi.fn(),
  checkPortAvailable: vi.fn().mockResolvedValue(true),
  stopContainer: vi.fn(),
  startContainer: vi.fn(),
}));
vi.mock("@/lib/docker/helpers", () => ({
  containerName: vi.fn(() => "aethera-mc-x"),
  deployConfigFromDoc: vi.fn(() => ({ name: "aethera-mc-x" })),
  serverEnvFromDoc: vi.fn(() => ({ EULA: "TRUE" })),
}));
vi.mock("@/lib/docker/storage", () => ({
  ensureServerDir: vi.fn().mockResolvedValue(undefined),
  getServerDataPath: vi.fn(() => "/data/run/x"),
}));
vi.mock("@/lib/services/project.service", () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
  ROLE_SERVER_PERMISSIONS: {},
}));
vi.mock("@/lib/services/permission-grant.service", () => ({
  grantIfAbsent: vi.fn().mockResolvedValue(undefined),
}));
const mockGetLatest = vi.fn().mockResolvedValue("1.21.4");
vi.mock("@/lib/services/minecraft-version.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/minecraft-version.service")>();
  return { ...actual, getLatestRelease: mockGetLatest };
});
const mockCreateBackup = vi.fn();
vi.mock("@/lib/services/backup-strategy.service", () => ({
  createBackupWithStrategy: mockCreateBackup,
}));

let svc: typeof import("@/lib/services/server.service");
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;
let mongo: MongoMemoryServer;
const ACTOR = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  svc = await import("@/lib/services/server.service");
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  await (await import("@/lib/db/connection")).connectDB();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  await ServerModel.deleteMany({});
  mockDeploy.mockClear();
  mockGetLatest.mockClear();
  mockGetLatest.mockResolvedValue("1.21.4");
  mockCreateBackup.mockClear();
});

async function makeLatestServer(over: Record<string, unknown> = {}) {
  return ServerModel.create({
    name: "L", projectKey: "p", identifier: "l", runtime: "minecraft",
    image: "itzg/minecraft-server", tag: "java21", port: 25565, memory: 2048,
    status: "stopped", version: "latest", ...over,
  });
}

describe("beginStartServer pre-flight — first start", () => {
  it("silently resolves resolvedMinecraftVersion on first start", async () => {
    const s = await makeLatestServer(); // no resolvedMinecraftVersion yet
    await svc.beginStartServer(String(s._id), ACTOR);
    // background start runs; give it a tick
    await new Promise((r) => setTimeout(r, 50));
    const updated = await ServerModel.findById(s._id);
    expect(updated!.resolvedMinecraftVersion).toBe("1.21.4");
    expect(updated!.javaVersion).toBe("21");
  });
});

import { VersionUpdateAvailableError } from "@/lib/api/errors";

describe("beginStartServer pre-flight — update available", () => {
  it("throws VersionUpdateAvailableError when no versionAction is given", async () => {
    const s = await makeLatestServer({ resolvedMinecraftVersion: "1.21.3" });
    await expect(svc.beginStartServer(String(s._id), ACTOR)).rejects.toBeInstanceOf(
      VersionUpdateAvailableError,
    );
    // No state change occurred.
    const after = await ServerModel.findById(s._id);
    expect(after!.status).toBe("stopped");
    expect(after!.resolvedMinecraftVersion).toBe("1.21.3");
    expect(mockDeploy).not.toHaveBeenCalled();
  });

  it("with versionAction 'keep' starts on the current version unchanged", async () => {
    const s = await makeLatestServer({ resolvedMinecraftVersion: "1.21.3" });
    await svc.beginStartServer(String(s._id), ACTOR, { versionAction: "keep" });
    await new Promise((r) => setTimeout(r, 50));
    const after = await ServerModel.findById(s._id);
    expect(after!.resolvedMinecraftVersion).toBe("1.21.3");
    expect(after!.status).toBe("running");
  });

  it("fails open and starts normally when Mojang fetch fails", async () => {
    mockGetLatest.mockRejectedValueOnce(new Error("network"));
    const s = await makeLatestServer({ resolvedMinecraftVersion: "1.21.3" });
    await svc.beginStartServer(String(s._id), ACTOR);
    await new Promise((r) => setTimeout(r, 50));
    const after = await ServerModel.findById(s._id);
    expect(after!.status).toBe("running");
    expect(after!.resolvedMinecraftVersion).toBe("1.21.3");
  });
});

describe("_executeVersionUpdateAndStart via beginStartServer", () => {
  it("backs up, switches version+java, deploys, and logs the update", async () => {
    const { BackupModel } = await import("@/lib/db/models/backup");
    const s = await makeLatestServer({ resolvedMinecraftVersion: "1.21.3" });

    // The backup completes immediately (status 'completed').
    mockCreateBackup.mockImplementation(async (serverId: string) => {
      const b = await BackupModel.create({
        serverId, name: "pre-update", filename: "f.tar.gz", path: "/p/f.tar.gz",
        size: 1, components: ["world"], status: "completed", strategy: "sync",
        createdBy: ACTOR,
      });
      return b.toObject();
    });

    await svc.beginStartServer(String(s._id), ACTOR, { versionAction: "update" });
    await new Promise((r) => setTimeout(r, 100));

    const after = await ServerModel.findById(s._id);
    expect(mockCreateBackup).toHaveBeenCalledWith(
      String(s._id), expect.any(Array), ACTOR, { bypassStateGuard: true },
    );
    expect(after!.resolvedMinecraftVersion).toBe("1.21.4");
    expect(after!.javaVersion).toBe("21");
    expect(after!.status).toBe("running");
    expect(mockDeploy).toHaveBeenCalledTimes(1);
  });
});
