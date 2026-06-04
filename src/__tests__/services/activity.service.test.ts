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

describe("getUnreadSummary", () => {
  it("counts unread logs across the user's projects, excluding own actions", async () => {
    const me = await UserModel.create({
      username: "me",
      email: "me@test.local",
      passwordHash: "x",
    });
    const other = await UserModel.create({
      username: "other",
      email: "other@test.local",
      passwordHash: "x",
    });
    await ProjectModel.create({ name: "Proj A", key: "proj-a", owner: me._id, members: [] });

    // 2 by other (unread), 1 by me (excluded)
    await ProjectLogModel.create([
      { projectKey: "proj-a", action: "SERVER_STARTED", actor: other._id, details: {} },
      { projectKey: "proj-a", action: "SERVER_STOPPED", actor: other._id, details: {} },
      { projectKey: "proj-a", action: "BACKUP_CREATED", actor: me._id, details: {} },
    ]);

    const summary = await activityService.getUnreadSummary(me._id.toString());
    expect(summary.total).toBe(2);
    expect(summary.perProject["proj-a"]).toBe(2);
  });

  it("respects lastSeenAt as the unread boundary", async () => {
    const me = await UserModel.create({
      username: "me",
      email: "me@test.local",
      passwordHash: "x",
    });
    const other = await UserModel.create({
      username: "other",
      email: "other@test.local",
      passwordHash: "x",
    });
    await ProjectModel.create({
      name: "Proj B",
      key: "proj-b",
      owner: other._id,
      members: [{ userId: me._id, role: "member" }],
    });

    const old = new Date(Date.now() - 60_000);
    const fresh = new Date(Date.now() + 60_000);
    await ProjectLogModel.create([
      { projectKey: "proj-b", action: "SERVER_STARTED", actor: other._id, details: {}, createdAt: old },
      { projectKey: "proj-b", action: "SERVER_STOPPED", actor: other._id, details: {}, createdAt: fresh },
    ]);
    await activityService.markSeen(me._id.toString(), "proj-b"); // lastSeenAt = now

    const summary = await activityService.getUnreadSummary(me._id.toString());
    expect(summary.perProject["proj-b"]).toBe(1); // only the future-dated one
  });
});

describe("markSeen idempotency & getGlobalRecent", () => {
  it("upserts exactly one ActivityRead row on repeated calls", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await activityService.markSeen(userId, "p1");
    const first = await ActivityReadModel.findOne({ userId, projectKey: "p1" }).lean();
    await activityService.markSeen(userId, "p1");
    const second = await ActivityReadModel.findOne({ userId, projectKey: "p1" }).lean();

    expect(await ActivityReadModel.countDocuments({ userId, projectKey: "p1" })).toBe(1);
    expect(second!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first!.lastSeenAt.getTime());
  });

  it("returns the newest logs across the user's projects with usernames", async () => {
    const me = await UserModel.create({
      username: "me",
      email: "me@test.local",
      passwordHash: "x",
    });
    const other = await UserModel.create({
      username: "bob",
      email: "bob@test.local",
      passwordHash: "x",
    });
    await ProjectModel.create({ name: "P1", key: "g1", owner: me._id, members: [] });
    await ProjectModel.create({
      name: "P2",
      key: "g2",
      owner: other._id,
      members: [{ userId: me._id, role: "member" }],
    });
    await ProjectModel.create({ name: "Hidden", key: "g3", owner: other._id, members: [] });

    await ProjectLogModel.create([
      { projectKey: "g1", action: "SERVER_STARTED", actor: other._id, details: { serverName: "mc" }, createdAt: new Date(1000) },
      { projectKey: "g2", action: "SERVER_STOPPED", actor: other._id, details: {}, createdAt: new Date(2000) },
      { projectKey: "g3", action: "SERVER_DELETED", actor: other._id, details: {}, createdAt: new Date(3000) },
    ]);

    const recent = await activityService.getGlobalRecent(me._id.toString(), 15);
    expect(recent).toHaveLength(2); // g3 excluded (not a member)
    expect(recent[0].projectKey).toBe("g2"); // newest first
    expect(recent[0].action).toBe("SERVER_STOPPED");
    expect(recent[0].actorUsername).toBe("bob");
    expect(typeof recent[0].createdAt).toBe("string");
    expect(typeof recent[0]._id).toBe("string");
  });
});
