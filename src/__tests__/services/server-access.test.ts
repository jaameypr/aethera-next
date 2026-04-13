import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongo: MongoMemoryServer;
let serverAccess: typeof import("@/lib/services/server-access");
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;

const OWNER_ID = new mongoose.Types.ObjectId().toString();
const MANAGER_ID = new mongoose.Types.ObjectId().toString();
const VIEWER_ID = new mongoose.Types.ObjectId().toString();
const OUTSIDER_ID = new mongoose.Types.ObjectId().toString();
const PROJECT_KEY = "perm-test";

beforeAll(async () => {
  await mongoose.disconnect();
  (global as any).mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();

  await (await import("@/lib/db/connection")).connectDB();

  serverAccess = await import("@/lib/services/server-access");
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  ProjectModel = (await import("@/lib/db/models/project")).ProjectModel;

  await ProjectModel.create({
    name: "Perm Test",
    key: PROJECT_KEY,
    owner: OWNER_ID,
    members: [
      { userId: MANAGER_ID, role: "manager" },
      { userId: VIEWER_ID, role: "viewer" },
    ],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await ServerModel.deleteMany({});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createServer(access: { userId: string; permissions: string[] }[] = []) {
  return ServerModel.create({
    name: "Test Server",
    projectKey: PROJECT_KEY,
    identifier: `srv-${Date.now()}`,
    runtime: "minecraft",
    image: "itzg/minecraft-server",
    tag: "stable",
    port: 25565,
    memory: 2048,
    status: "stopped",
    env: {},
    properties: {},
    autoStart: false,
    access,
  });
}

// ---------------------------------------------------------------------------
// assertServerPermission
// ---------------------------------------------------------------------------

describe("assertServerPermission", () => {
  it("allows the project owner regardless of access entries", async () => {
    const server = await createServer([]); // owner has no explicit entry
    await expect(
      serverAccess.assertServerPermission(server.toObject(), OWNER_ID, "server.start"),
    ).resolves.toBeUndefined();
  });

  it("allows a manager who has the required permission in server.access", async () => {
    const server = await createServer([
      { userId: MANAGER_ID, permissions: ["server.start", "server.stop", "server.console"] },
    ]);
    await expect(
      serverAccess.assertServerPermission(server.toObject(), MANAGER_ID, "server.start"),
    ).resolves.toBeUndefined();
  });

  it("denies a viewer who has no server.access entry", async () => {
    const server = await createServer([]); // viewer was never granted access
    await expect(
      serverAccess.assertServerPermission(server.toObject(), VIEWER_ID, "server.start"),
    ).rejects.toThrow(/Permission denied/i);
  });

  it("denies a viewer with an empty permissions array in server.access", async () => {
    const server = await createServer([{ userId: VIEWER_ID, permissions: [] }]);
    await expect(
      serverAccess.assertServerPermission(server.toObject(), VIEWER_ID, "server.console"),
    ).rejects.toThrow(/Permission denied/i);
  });

  it("denies a manager who lacks the specific permission (e.g. server.settings)", async () => {
    const server = await createServer([
      { userId: MANAGER_ID, permissions: ["server.start", "server.stop"] },
    ]);
    await expect(
      serverAccess.assertServerPermission(server.toObject(), MANAGER_ID, "server.settings"),
    ).rejects.toThrow(/Permission denied/i);
  });

  it("denies a user who is not a project member at all", async () => {
    const server = await createServer([]);
    await expect(
      serverAccess.assertServerPermission(server.toObject(), OUTSIDER_ID, "server.start"),
    ).rejects.toThrow(/Permission denied/i);
  });

  it("respects per-server revocation: removed entry means denied even if still a project member", async () => {
    // Manager's entry was removed (per-server revoke)
    const server = await createServer([]); // no entry for MANAGER_ID
    await expect(
      serverAccess.assertServerPermission(server.toObject(), MANAGER_ID, "server.start"),
    ).rejects.toThrow(/Permission denied/i);
  });
});

// ---------------------------------------------------------------------------
// createServer backfills member access
// ---------------------------------------------------------------------------

describe("createServer member backfill", () => {
  it("populates server.access for existing project members based on their role", async () => {
    const { createServer: svcCreate } = await import("@/lib/services/server.service");

    // Mock logAction and grantIfAbsent dependencies
    const server = await svcCreate(
      PROJECT_KEY,
      {
        name: "Backfill Test",
        identifier: `backfill-${Date.now()}`,
        runtime: "minecraft",
        image: "itzg/minecraft-server",
        tag: "stable",
        port: 25570,
        memory: 1024,
      },
      OWNER_ID,
    );

    const doc = await ServerModel.findById(server._id).lean();
    const accessUserIds = (doc!.access ?? []).map((a: any) => a.userId.toString());

    // Manager should have an entry (non-empty permissions)
    expect(accessUserIds).toContain(MANAGER_ID);

    // Viewer should NOT have an entry (empty permissions are skipped)
    expect(accessUserIds).not.toContain(VIEWER_ID);

    const managerEntry = (doc!.access ?? []).find((a: any) => a.userId.toString() === MANAGER_ID);
    expect(managerEntry!.permissions).toContain("server.start");
    expect(managerEntry!.permissions).toContain("server.stop");
    expect(managerEntry!.permissions).toContain("server.console");
  });
});
