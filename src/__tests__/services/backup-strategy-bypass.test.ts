import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

vi.mock("@/lib/services/project.service", () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/paperview.service", () => ({
  isPaperviewReady: vi.fn().mockResolvedValue(false),
  uploadBackupToShare: vi.fn(),
}));
vi.mock("@/lib/services/minecraft-saves", () => ({
  issueMinecraftSaveOff: vi.fn().mockResolvedValue(undefined),
  issueMinecraftSaveOn: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/backup.service", () => ({
  createBackup: vi.fn(),
  assertBackupQuota: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/discord-module.service", () => ({
  sendServerEventToDiscordModule: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/workers/backup-runner", () => ({
  dispatchBackupJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/docker/storage", () => ({
  getBackupDir: vi.fn(() => "/data/backup"),
  getServerDataPath: vi.fn(() => "/data/run/x"),
  resolveServerDataPath: vi.fn().mockResolvedValue("/data/run/x"),
}));

let svc: typeof import("@/lib/services/backup-strategy.service");
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;
let mongo: MongoMemoryServer;
const ACTOR = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  svc = await import("@/lib/services/backup-strategy.service");
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  await (await import("@/lib/db/connection")).connectDB();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  const { BackupModel } = await import("@/lib/db/models/backup");
  await ServerModel.deleteMany({});
  await BackupModel.deleteMany({});
});

describe("createBackupWithStrategy bypassStateGuard", () => {
  it("rejects a 'starting' server without the bypass", async () => {
    const s = await ServerModel.create({
      name: "S", projectKey: "p", identifier: "s", runtime: "minecraft",
      image: "itzg/minecraft-server", tag: "java21", port: 25565, memory: 2048,
      status: "starting",
    });
    await expect(
      svc.createBackupWithStrategy(String(s._id), ["world"], ACTOR),
    ).rejects.toThrow(/while the server is starting/i);
  });

  it("accepts a 'starting' server with bypassStateGuard", async () => {
    const s = await ServerModel.create({
      name: "S", projectKey: "p", identifier: "s2", runtime: "minecraft",
      image: "itzg/minecraft-server", tag: "java21", port: 25566, memory: 2048,
      status: "starting",
    });
    const backup = await svc.createBackupWithStrategy(
      String(s._id), ["world"], ACTOR, { bypassStateGuard: true },
    );
    expect(backup.status).toBe("in_progress");
  });
});
