import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Mock next/cache (used by other actions in the same module)
// ---------------------------------------------------------------------------
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// ---------------------------------------------------------------------------
// Mock requireSession — returns a stable userId we control per-test
// ---------------------------------------------------------------------------
const mockUserId = new mongoose.Types.ObjectId().toString();

vi.mock("@/lib/auth/guards", () => ({
  requireSession: vi.fn().mockResolvedValue({ userId: mockUserId }),
  withPermission: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Docker layer (server.service.ts pulls these in)
// ---------------------------------------------------------------------------
vi.mock("@/lib/docker/orchestrator", () => ({
  getOrchestrator: vi.fn().mockResolvedValue({
    deploy: vi.fn(),
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
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;
let ramRemainingAction: typeof import("@/app/(app)/actions/servers").ramRemainingAction;

const PROJECT_KEY = "quota-test";

beforeAll(async () => {
  await mongoose.disconnect();
  (global as any).mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();

  await (await import("@/lib/db/connection")).connectDB();

  UserModel = (await import("@/lib/db/models/user")).UserModel;
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  ProjectModel = (await import("@/lib/db/models/project")).ProjectModel;

  ({ ramRemainingAction } = await import("@/app/(app)/actions/servers"));

  await ProjectModel.create({
    name: "Quota Test Project",
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
  await UserModel.deleteMany({});
  await ServerModel.deleteMany({});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(ramMb?: number) {
  const permissions = ramMb !== undefined
    ? [{ name: "user.ram", allow: true, value: ramMb }]
    : [];
  return UserModel.create({
    _id: new mongoose.Types.ObjectId(mockUserId),
    username: "testuser",
    email: "test@example.com",
    passwordHash: "hash",
    enabled: true,
    roles: [],
    permissions,
  });
}

async function createServer(memoryMb: number, status = "running") {
  return ServerModel.create({
    name: "Test Server",
    identifier: `server-${Math.random().toString(36).slice(2)}`,
    projectKey: PROJECT_KEY,
    runtime: "minecraft",
    image: "itzg/minecraft-server",
    tag: "stable",
    port: 25565,
    memory: memoryMb,
    status,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ramRemainingAction", () => {
  it("returns correct quota when user has user.ram=8192 and 3072 MB in use", async () => {
    await createUser(8192);
    // Three running servers: 1024 + 1024 + 1024 = 3072 MB
    await createServer(1024);
    await createServer(1024);
    await createServer(1024);

    const result = await ramRemainingAction();

    expect(result.limitMb).toBe(8192);
    expect(result.usedMb).toBe(3072);
    expect(result.availableMb).toBe(5120);
  });

  it("does not count stopped servers toward usage", async () => {
    await createUser(4096);
    await createServer(2048, "running");
    await createServer(2048, "stopped");

    const result = await ramRemainingAction();

    expect(result.usedMb).toBe(2048);
    expect(result.availableMb).toBe(2048);
  });

  it("returns zeroes when user has no user.ram permission", async () => {
    await createUser(); // no ram permission

    const result = await ramRemainingAction();

    expect(result.limitMb).toBe(0);
    expect(result.usedMb).toBe(0);
    expect(result.availableMb).toBe(0);
  });

  it("returns zeroes when user does not exist", async () => {
    // No user created — requireSession returns mockUserId but DB has no doc

    const result = await ramRemainingAction();

    expect(result.limitMb).toBe(0);
    expect(result.usedMb).toBe(0);
    expect(result.availableMb).toBe(0);
  });
});
