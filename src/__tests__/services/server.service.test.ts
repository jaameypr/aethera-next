import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Mock docker-orchestrator before any imports that use it
// ---------------------------------------------------------------------------

const mockDeploy = vi.fn().mockResolvedValue({ containerId: "container-123", status: "running" });
const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockHealth = vi.fn().mockReturnValue({
  daemon: "connected",
  circuit: "closed",
  activeStreams: 0,
  pendingOperations: 0,
});

const mockOrchestrator = {
  deploy: mockDeploy,
  destroy: mockDestroy,
  health: mockHealth,
  presets: { register: vi.fn() },
  attach: {
    console: vi.fn(),
    send: vi.fn(),
  },
};

vi.mock("@/lib/docker/orchestrator", () => ({
  getOrchestrator: vi.fn().mockResolvedValue(mockOrchestrator),
  getDockerClient: vi.fn().mockResolvedValue({}),
  CONTAINER_PREFIX_MC: "aethera-mc-",
  CONTAINER_PREFIX_HYT: "aethera-hyt-",
}));

vi.mock("@pruefertit/docker-orchestrator", () => ({
  inspectContainer: vi.fn().mockResolvedValue({
    State: { Status: "running", Running: true, StartedAt: new Date().toISOString() },
  }),
  listContainers: vi.fn().mockResolvedValue([]),
  tailLogs: vi.fn().mockResolvedValue([]),
  checkPortAvailable: vi.fn().mockResolvedValue(true),
  createClient: vi.fn(),
  createOrchestrator: vi.fn(),
  definePreset: vi.fn(),
}));

vi.mock("@/lib/docker/helpers", () => ({
  containerName: vi.fn((server: { runtime: string; identifier: string }) =>
    `aethera-${server.runtime === "minecraft" ? "mc" : "hyt"}-${server.identifier}`,
  ),
  deployConfigFromDoc: vi.fn(() => ({
    image: "itzg/minecraft-server",
    tag: "stable",
    env: { EULA: "TRUE" },
    mounts: [],
    labels: {},
    ports: [],
  })),
  serverEnvFromDoc: vi.fn(() => ({ EULA: "TRUE" })),
}));

vi.mock("@/lib/docker/storage", () => ({
  ensureServerDir: vi.fn().mockResolvedValue(undefined),
  deleteServerDir: vi.fn().mockResolvedValue(undefined),
  getServerDataPath: vi.fn((id: string) => `/data/run/${id}`),
  getDataDir: vi.fn(() => "/data/run"),
  getBackupDir: vi.fn(() => "/data/backup"),
  getUploadDir: vi.fn(() => "/data/upload"),
}));

vi.mock("@/lib/services/project.service", () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let serverService: typeof import("@/lib/services/server.service");
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;

let mongo: MongoMemoryServer;
const ACTOR_ID = new mongoose.Types.ObjectId().toString();
const PROJECT_KEY = "test-project";

beforeAll(async () => {
  // Reset any cached mongoose connection from other test files
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();

  serverService = await import("@/lib/services/server.service");
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  ProjectModel = (await import("@/lib/db/models/project")).ProjectModel;

  // Create test project
  await (await import("@/lib/db/connection")).connectDB();
  await ProjectModel.create({
    name: "Test Project",
    key: PROJECT_KEY,
    owner: ACTOR_ID,
    members: [],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await ServerModel.deleteMany({});
  mockDeploy.mockClear();
  mockDestroy.mockClear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestServer(overrides: Record<string, unknown> = {}) {
  return serverService.createServer(
    PROJECT_KEY,
    {
      name: "Test MC",
      identifier: "test-mc",
      runtime: "minecraft",
      image: "itzg/minecraft-server",
      tag: "stable",
      port: 25565,
      memory: 2048,
      ...overrides,
    },
    ACTOR_ID,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createServer", () => {
  it("creates a server document in the database", async () => {
    const server = await createTestServer();

    expect(server.name).toBe("Test MC");
    expect(server.identifier).toBe("test-mc");
    expect(server.runtime).toBe("minecraft");
    expect(server.status).toBe("stopped");
    expect(server.projectKey).toBe(PROJECT_KEY);
  });

  it("does not start the container on creation", async () => {
    await createTestServer();
    expect(mockDeploy).not.toHaveBeenCalled();
  });
});

describe("getServer", () => {
  it("returns a server by ID", async () => {
    const created = await createTestServer();
    const found = await serverService.getServer(String(created._id));

    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test MC");
  });

  it("returns null for non-existent ID", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const result = await serverService.getServer(id);
    expect(result).toBeNull();
  });
});

describe("startServer", () => {
  it("deploys via orchestrator and updates DB", async () => {
    const server = await createTestServer();
    const serverId = String(server._id);

    const result = await serverService.startServer(serverId, ACTOR_ID);

    expect(result.containerId).toBe("container-123");
    expect(mockDeploy).toHaveBeenCalledTimes(1);

    // Check DB was updated
    const updated = await serverService.getServer(serverId);
    expect(updated!.containerId).toBe("container-123");
    expect(updated!.status).toBe("running");
  });
});

describe("stopServer", () => {
  it("destroys container via orchestrator and updates DB", async () => {
    const server = await createTestServer();
    const serverId = String(server._id);

    // Start first
    await serverService.startServer(serverId, ACTOR_ID);
    mockDeploy.mockClear();

    // Stop
    await serverService.stopServer(serverId, ACTOR_ID);

    expect(mockDestroy).toHaveBeenCalledTimes(1);

    const updated = await serverService.getServer(serverId);
    expect(updated!.status).toBe("stopped");
  });
});

describe("deleteServer", () => {
  it("removes the server from the database", async () => {
    const server = await createTestServer();
    const serverId = String(server._id);

    await serverService.deleteServer(serverId, ACTOR_ID);

    const found = await serverService.getServer(serverId);
    expect(found).toBeNull();
  });

  it("stops a running container before deleting", async () => {
    const server = await createTestServer();
    const serverId = String(server._id);
    await serverService.startServer(serverId, ACTOR_ID);

    await serverService.deleteServer(serverId, ACTOR_ID);

    expect(mockDestroy).toHaveBeenCalled();
  });
});

describe("isPortAvailable", () => {
  it("returns true for an available port", async () => {
    const result = await serverService.isPortAvailable(25565);
    expect(result).toBe(true);
  });
});

describe("getRamRemaining", () => {
  it("returns memory info", async () => {
    const ram = await serverService.getRamRemaining();
    expect(ram).toHaveProperty("total");
    expect(ram).toHaveProperty("used");
    expect(ram).toHaveProperty("available");
    expect(ram.total).toBeGreaterThan(0);
  });
});
