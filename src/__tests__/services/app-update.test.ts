import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// ── Mock Docker so no real daemon is ever touched ───────────────────────────
const mockPullImage = vi.fn().mockResolvedValue(undefined);

// Detached-helper container: dockerode-style createContainer + start spies.
const mockHelperStart = vi.fn().mockResolvedValue(undefined);
const mockCreateContainer = vi
  .fn()
  .mockResolvedValue({ id: "updater-id", start: mockHelperStart });
// A pre-existing aethera-updater that runUpdate must force-remove before
// creating a fresh one (name-clash guard).
const mockExistingUpdaterRemove = vi.fn().mockResolvedValue(undefined);
const mockGetContainer = vi.fn().mockReturnValue({
  remove: mockExistingUpdaterRemove,
});
const mockDocker = {
  getContainer: mockGetContainer,
  createContainer: mockCreateContainer,
};
vi.mock("@/lib/docker/orchestrator", () => ({
  getOrchestrator: vi.fn().mockResolvedValue({ deploy: vi.fn() }),
  getDockerClient: vi.fn().mockResolvedValue(mockDocker),
}));
vi.mock("@pruefertit/docker-orchestrator", () => ({
  pullImage: (...args: unknown[]) => mockPullImage(...args),
}));

// ── Mock the update-check service ───────────────────────────────────────────
const getUpdateStatus = vi.fn();
vi.mock("@/lib/services/app-version.service", () => ({
  getUpdateStatus: (...args: unknown[]) => getUpdateStatus(...args),
  getCurrentVersion: () => "0.2.0",
}));

const UPDATE_AVAILABLE = {
  current: "0.2.0",
  latest: "0.3.0",
  updateAvailable: true,
  mandatory: false,
  changelog: "Bug fixes",
  channel: "stable",
  imageTag: "0.3.0",
  checkedAt: "2026-06-26T00:00:00.000Z",
};

const NO_UPDATE = { ...UPDATE_AVAILABLE, updateAvailable: false, latest: null };

let mongo: MongoMemoryServer;
let svc: typeof import("@/lib/services/app-update.service");
let AsyncJobModel: typeof import("@/lib/db/models/async-job").AsyncJobModel;
let InstalledModuleModel: typeof import("@/lib/db/models/installed-module").InstalledModuleModel;

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await (await import("@/lib/db/connection")).connectDB();
  AsyncJobModel = (await import("@/lib/db/models/async-job")).AsyncJobModel;
  InstalledModuleModel = (
    await import("@/lib/db/models/installed-module")
  ).InstalledModuleModel;
  svc = await import("@/lib/services/app-update.service");
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await AsyncJobModel.deleteMany({});
  await InstalledModuleModel.deleteMany({});
  mockPullImage.mockClear();
  mockCreateContainer.mockClear();
  mockHelperStart.mockClear();
  mockGetContainer.mockClear();
  mockExistingUpdaterRemove.mockClear();
  getUpdateStatus.mockReset();
  getUpdateStatus.mockResolvedValue(UPDATE_AVAILABLE);
  delete process.env.AETHERA_SELF_UPDATE;
});

function seedInstalledModule(status: string) {
  return InstalledModuleModel.create({
    moduleId: "paperview",
    name: "Paperview",
    version: "1.0.0",
    type: "docker",
    status,
    manifest: {},
    config: [],
    sidebar: [],
    permissions: [],
    installedBy: new mongoose.Types.ObjectId(),
  });
}

describe("countInFlight", () => {
  it("counts a running AsyncJob as in-flight", async () => {
    await AsyncJobModel.create({ type: "backup:create", status: "running", payload: {} });
    expect(await svc.countInFlight()).toBe(1);
  });

  it("does not count a finished AsyncJob", async () => {
    const job = await AsyncJobModel.create({
      type: "backup:create",
      status: "running",
      payload: {},
    });
    expect(await svc.countInFlight()).toBe(1);
    job.status = "done";
    await job.save();
    expect(await svc.countInFlight()).toBe(0);
  });

  it("counts a pending AsyncJob as in-flight", async () => {
    await AsyncJobModel.create({ type: "backup:restore", status: "pending", payload: {} });
    expect(await svc.countInFlight()).toBe(1);
  });

  it("counts an InstalledModule in a transitional state as in-flight", async () => {
    await seedInstalledModule("updating");
    expect(await svc.countInFlight()).toBe(1);
  });

  it("does not count a running (stable) InstalledModule", async () => {
    await seedInstalledModule("running");
    expect(await svc.countInFlight()).toBe(0);
  });
});

describe("drainJobs", () => {
  it("rejects on timeout when a job stays in-flight", async () => {
    await AsyncJobModel.create({ type: "backup:create", status: "running", payload: {} });
    await expect(svc.drainJobs(50)).rejects.toThrow();
  });

  it("resolves immediately when nothing is in-flight", async () => {
    await expect(svc.drainJobs(50)).resolves.toBeUndefined();
  });
});

describe("runUpdate", () => {
  it("throws when no update is available", async () => {
    getUpdateStatus.mockResolvedValue(NO_UPDATE);
    await expect(svc.runUpdate({ wait: false })).rejects.toThrow();
    expect(mockPullImage).not.toHaveBeenCalled();
  });

  it("rejects with a 409-mapped error carrying runningJobs when busy and not waiting", async () => {
    await AsyncJobModel.create({ type: "backup:create", status: "running", payload: {} });
    await expect(svc.runUpdate({ wait: false })).rejects.toMatchObject({
      statusCode: 409,
      runningJobs: 1,
    });
    expect(mockPullImage).not.toHaveBeenCalled();
  });

  it("pulls the image and returns pulled/manual when AETHERA_SELF_UPDATE is unset", async () => {
    const result = await svc.runUpdate({ wait: false, actorId: "actor-1" });
    expect(mockPullImage).toHaveBeenCalledTimes(1);
    const [, imageRef] = mockPullImage.mock.calls[0];
    expect(imageRef).toBe("ghcr.io/jaameypr/aethera-next:0.3.0");
    // Without the flag, no detached helper is ever launched.
    expect(mockCreateContainer).not.toHaveBeenCalled();
    expect(result.status).toBe("pulled");
    expect(result.manual).toBe(true);
    expect(result.imageTag).toBe("0.3.0");
  });

  it("launches the detached self-update helper under AETHERA_SELF_UPDATE", async () => {
    process.env.AETHERA_SELF_UPDATE = "true";

    const result = await svc.runUpdate({ wait: false, actorId: "actor-1" });

    // Image is pulled first.
    expect(mockPullImage).toHaveBeenCalledTimes(1);

    // Any stale updater is force-removed before a fresh one is created.
    expect(mockGetContainer).toHaveBeenCalledWith("aethera-updater");
    expect(mockExistingUpdaterRemove).toHaveBeenCalledWith({ force: true });

    // A detached helper container is created from the NEW image, mounting the
    // Docker socket and running the finisher against aethera-app.
    expect(mockCreateContainer).toHaveBeenCalledTimes(1);
    const arg = mockCreateContainer.mock.calls[0][0];
    expect(arg.name).toBe("aethera-updater");
    expect(arg.Image).toBe("ghcr.io/jaameypr/aethera-next:0.3.0");
    expect(arg.Cmd).toEqual([
      "node",
      "/app/scripts/self-update-finish.js",
      "aethera-app",
      "ghcr.io/jaameypr/aethera-next:0.3.0",
    ]);
    expect(arg.HostConfig.Binds).toContain(
      "/var/run/docker.sock:/var/run/docker.sock",
    );
    expect(arg.HostConfig.AutoRemove).toBe(true);
    expect(arg.HostConfig.RestartPolicy).toEqual({ Name: "no" });
    expect(arg.Labels).toMatchObject({ "aethera.role": "updater" });

    // The helper is started.
    expect(mockHelperStart).toHaveBeenCalledTimes(1);

    expect(result.status).toBe("updating");
    expect(result.restarting).toBe(true);
    expect(result.imageTag).toBe("0.3.0");
  });
});
