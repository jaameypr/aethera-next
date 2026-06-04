import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// Imported after setup.ts mocks "server-only".
let ActivityReadModel: typeof import("@/lib/db/models/activity-read").ActivityReadModel;
let ProjectLogModel: typeof import("@/lib/db/models/project-log").ProjectLogModel;
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;
let UserModel: typeof import("@/lib/db/models/user").UserModel;
let activityService: typeof import("@/lib/services/activity.service");

let mongo: MongoMemoryServer;

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();

  const { connectDB } = await import("@/lib/db/connection");
  await connectDB();

  ActivityReadModel = (await import("@/lib/db/models/activity-read")).ActivityReadModel;
  ProjectLogModel = (await import("@/lib/db/models/project-log")).ProjectLogModel;
  ProjectModel = (await import("@/lib/db/models/project")).ProjectModel;
  UserModel = (await import("@/lib/db/models/user")).UserModel;
  // activity.service is introduced in Task 20; tolerate its absence so the
  // model-only tests in Task 19 can run before the service exists.
  try {
    activityService = await import("@/lib/services/activity.service");
  } catch {
    // service not present yet — later-task describe blocks supply it.
  }

  await ActivityReadModel.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await ActivityReadModel.deleteMany({});
  await ProjectLogModel.deleteMany({});
  await ProjectModel.deleteMany({});
  await UserModel.deleteMany({});
});

describe("ActivityRead model", () => {
  it("includes SERVER_VERSION_UPDATED in PROJECT_LOG_ACTIONS", async () => {
    const { PROJECT_LOG_ACTIONS } = await import("@/lib/db/models/project-log");
    expect(PROJECT_LOG_ACTIONS).toContain("SERVER_VERSION_UPDATED");
  });

  it("enforces a compound-unique index on { userId, projectKey }", async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityReadModel.create({ userId, projectKey: "p1", lastSeenAt: new Date() });
    await expect(
      ActivityReadModel.create({ userId, projectKey: "p1", lastSeenAt: new Date() }),
    ).rejects.toThrow();
  });

  it("allows the same user across different projects", async () => {
    const userId = new mongoose.Types.ObjectId();
    await ActivityReadModel.create({ userId, projectKey: "p1", lastSeenAt: new Date() });
    await ActivityReadModel.create({ userId, projectKey: "p2", lastSeenAt: new Date() });
    expect(await ActivityReadModel.countDocuments({ userId })).toBe(2);
  });
});

describe("getProjectFeed", () => {
  it("resolves actor usernames and paginates", async () => {
    const actor = await UserModel.create({
      username: "alice",
      email: "alice@test.local",
      passwordHash: "x",
    });
    await ProjectLogModel.create([
      { projectKey: "feed", action: "SERVER_STARTED", actor: actor._id, details: {} },
      { projectKey: "feed", action: "SERVER_STOPPED", actor: actor._id, details: {} },
    ]);

    const result = await activityService.getProjectFeed("feed", { page: 1, size: 10 });

    expect(result.total).toBe(2);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.actorUsername === "alice")).toBe(true);
  });

  it("falls back to the actor id when the user is missing", async () => {
    const orphanId = new mongoose.Types.ObjectId();
    await ProjectLogModel.create({
      projectKey: "feed",
      action: "SERVER_STARTED",
      actor: orphanId,
      details: {},
    });

    const result = await activityService.getProjectFeed("feed", { page: 1, size: 10 });
    expect(result.entries[0].actorUsername).toBe(orphanId.toString());
  });
});
