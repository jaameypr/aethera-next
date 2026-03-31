import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Mock next/cache
// ---------------------------------------------------------------------------
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock requireSession
// ---------------------------------------------------------------------------
const mockUserId = new mongoose.Types.ObjectId().toString();

vi.mock("@/lib/auth/guards", () => ({
  requireSession: vi.fn().mockResolvedValue({ userId: mockUserId }),
  withPermission: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Docker layer
// ---------------------------------------------------------------------------
vi.mock("@/lib/docker/orchestrator", () => ({
  getOrchestrator: vi.fn().mockResolvedValue({
    deploy: vi.fn().mockResolvedValue({ containerId: "c-123", status: "running" }),
    destroy: vi.fn(),
    health: vi.fn(),
    presets: { register: vi.fn() },
    attach: { console: vi.fn(), send: vi.fn() },
  }),
  getDockerClient: vi.fn().mockResolvedValue({}),
  CONTAINER_PREFIX_MC: "aethera-mc-",
  CONTAINER_PREFIX_HYT: "aethera-hyt-",
}));

vi.mock("@pruefertit/docker-orchestrator", () => ({
  inspectContainer: vi.fn(),
  listContainers: vi.fn().mockResolvedValue([]),
  tailLogs: vi.fn().mockResolvedValue([]),
  checkPortAvailable: vi.fn().mockResolvedValue(true),
  createClient: vi.fn(),
  createOrchestrator: vi.fn(),
  definePreset: vi.fn(),
  stopContainer: vi.fn(),
  startContainer: vi.fn(),
}));

vi.mock("@/lib/docker/helpers", () => ({
  containerName: vi.fn((s: { runtime: string; identifier: string }) =>
    `aethera-${s.runtime === "minecraft" ? "mc" : "hyt"}-${s.identifier}`,
  ),
  deployConfigFromDoc: vi.fn(() => ({
    image: "itzg/minecraft-server",
    tag: "stable",
    env: {},
    mounts: [],
    labels: {},
    ports: [],
  })),
  serverEnvFromDoc: vi.fn(() => ({})),
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

let mongo: MongoMemoryServer;
let UserModel: typeof import("@/lib/db/models/user").UserModel;
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;
let BlueprintModel: typeof import("@/lib/db/models/blueprint").BlueprintModel;
let createBlueprintAction: typeof import("@/app/(app)/actions/servers").createBlueprintAction;
let deleteBlueprintAction: typeof import("@/app/(app)/actions/servers").deleteBlueprintAction;
let listBlueprintsAction: typeof import("@/app/(app)/actions/servers").listBlueprintsAction;
let initializeBlueprintAction: typeof import("@/app/(app)/actions/servers").initializeBlueprintAction;

const PROJECT_KEY = "bp-test";

beforeAll(async () => {
  await mongoose.disconnect();
  (global as any).mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();

  await (await import("@/lib/db/connection")).connectDB();

  UserModel = (await import("@/lib/db/models/user")).UserModel;
  ProjectModel = (await import("@/lib/db/models/project")).ProjectModel;
  BlueprintModel = (await import("@/lib/db/models/blueprint")).BlueprintModel;

  ({
    createBlueprintAction,
    deleteBlueprintAction,
    listBlueprintsAction,
    initializeBlueprintAction,
  } = await import("@/app/(app)/actions/servers"));

  await UserModel.create({
    _id: new mongoose.Types.ObjectId(mockUserId),
    username: "testuser",
    email: "test@example.com",
    passwordHash: "hash",
    enabled: true,
    roles: [],
    permissions: [],
  });

  await ProjectModel.create({
    name: "BP Test Project",
    key: PROJECT_KEY,
    owner: mockUserId,
    members: [],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await BlueprintModel.deleteMany({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createBlueprintAction", () => {
  it("creates a blueprint with the given name and maxRam", async () => {
    const bp = await createBlueprintAction({
      projectKey: PROJECT_KEY,
      name: "Survival Slot",
      maxRam: 4096,
    });

    expect(bp.name).toBe("Survival Slot");
    expect(bp.maxRam).toBe(4096);
    expect(bp.status).toBe("available");
    expect(bp.projectKey).toBe(PROJECT_KEY);
  });
});

describe("listBlueprintsAction", () => {
  it("returns all blueprints for the project", async () => {
    await createBlueprintAction({ projectKey: PROJECT_KEY, name: "Slot A", maxRam: 2048 });
    await createBlueprintAction({ projectKey: PROJECT_KEY, name: "Slot B", maxRam: 4096 });

    const list = await listBlueprintsAction({ projectKey: PROJECT_KEY });

    expect(list).toHaveLength(2);
    expect(list.map((b) => b.name).sort()).toEqual(["Slot A", "Slot B"]);
  });
});

describe("deleteBlueprintAction", () => {
  it("removes the blueprint", async () => {
    const bp = await createBlueprintAction({
      projectKey: PROJECT_KEY,
      name: "To Delete",
      maxRam: 1024,
    });

    await deleteBlueprintAction({ blueprintId: bp._id.toString(), projectKey: PROJECT_KEY });

    const list = await listBlueprintsAction({ projectKey: PROJECT_KEY });
    expect(list).toHaveLength(0);
  });
});

describe("initializeBlueprintAction", () => {
  it("claims the blueprint and creates a server", async () => {
    const bp = await createBlueprintAction({
      projectKey: PROJECT_KEY,
      name: "Init Slot",
      maxRam: 4096,
    });

    const result = await initializeBlueprintAction({
      blueprintId: bp._id.toString(),
      projectKey: PROJECT_KEY,
      input: {
        name: "My Server",
        identifier: `srv-${Date.now()}`,
        runtime: "minecraft",
        image: "itzg/minecraft-server",
        tag: "stable",
        port: 25565,
        memory: 2048,
      },
    });

    expect(result.serverId).toBeDefined();

    const updated = await BlueprintModel.findById(bp._id);
    expect(updated!.status).toBe("claimed");
    expect(updated!.serverId?.toString()).toBe(result.serverId);
  });

  it("throws if requested RAM exceeds blueprint maxRam", async () => {
    const bp = await createBlueprintAction({
      projectKey: PROJECT_KEY,
      name: "Small Slot",
      maxRam: 1024,
    });

    await expect(
      initializeBlueprintAction({
        blueprintId: bp._id.toString(),
        projectKey: PROJECT_KEY,
        input: {
          name: "Too Big",
          identifier: `srv-${Date.now()}`,
          runtime: "minecraft",
          image: "itzg/minecraft-server",
          tag: "stable",
          port: 25566,
          memory: 2048,
        },
      }),
    ).rejects.toThrow(/RAM exceeds blueprint limit/);
  });

  it("throws if blueprint is already claimed", async () => {
    const bp = await createBlueprintAction({
      projectKey: PROJECT_KEY,
      name: "Claimed Slot",
      maxRam: 4096,
    });

    await initializeBlueprintAction({
      blueprintId: bp._id.toString(),
      projectKey: PROJECT_KEY,
      input: {
        name: "First",
        identifier: `srv-first-${Date.now()}`,
        runtime: "minecraft",
        image: "itzg/minecraft-server",
        tag: "stable",
        port: 25567,
        memory: 1024,
      },
    });

    await expect(
      initializeBlueprintAction({
        blueprintId: bp._id.toString(),
        projectKey: PROJECT_KEY,
        input: {
          name: "Second",
          identifier: `srv-second-${Date.now()}`,
          runtime: "minecraft",
          image: "itzg/minecraft-server",
          tag: "stable",
          port: 25568,
          memory: 1024,
        },
      }),
    ).rejects.toThrow(/already claimed/);
  });
});

