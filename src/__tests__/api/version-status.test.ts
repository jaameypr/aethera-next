import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

let mongo: MongoMemoryServer;

// Dynamic imports after env setup
let UserModel: typeof import("@/lib/db/models/user").UserModel;
let RoleModel: typeof import("@/lib/db/models/role").RoleModel;
let connectDB: typeof import("@/lib/db/connection").connectDB;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;
let createUser: typeof import("@/lib/services/user.service").createUser;

// The update-check service is mocked — this route only guards + relays it.
const getUpdateStatus = vi.fn();
vi.mock("@/lib/services/app-version.service", () => ({
  getUpdateStatus: () => getUpdateStatus(),
  getCurrentVersion: () => "0.2.0",
}));

const SAMPLE_STATUS = {
  current: "0.2.0",
  latest: "0.3.0",
  updateAvailable: true,
  mandatory: false,
  changelog: "Bug fixes",
  channel: "stable",
  imageTag: "0.3.0",
  checkedAt: "2026-06-26T00:00:00.000Z",
};

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = "test-jwt-secret-that-is-long-enough-for-hmac-256";
  process.env.JWT_ISSUER = "aethera-test";
  process.env.JWT_ACCESS_TTL = "15m";

  connectDB = (await import("@/lib/db/connection")).connectDB;
  await connectDB();

  UserModel = (await import("@/lib/db/models/user")).UserModel;
  RoleModel = (await import("@/lib/db/models/role")).RoleModel;
  signAccessToken = (await import("@/lib/auth/jwt")).signAccessToken;
  createUser = (await import("@/lib/services/user.service")).createUser;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await RoleModel.deleteMany({});
  getUpdateStatus.mockReset();
  getUpdateStatus.mockResolvedValue(SAMPLE_STATUS);
});

/** Seed a user holding `permissions`, return a NextRequest carrying its token. */
async function requestForUser(
  permissions: { name: string; allow: boolean }[],
): Promise<NextRequest> {
  const { user } = await createUser({
    username: "tester",
    email: "tester@test.com",
    password: "password123",
    roles: [],
    permissions,
  });

  const { token } = await signAccessToken(user._id.toString(), []);
  return new NextRequest("http://localhost:3000/api/admin/version-status", {
    headers: { cookie: `access_token=${token}` },
  });
}

describe("GET /api/admin/version-status", () => {
  it("returns 200 + the update status for a user WITH admin.system", async () => {
    const req = await requestForUser([{ name: "admin.system", allow: true }]);

    const { GET } = await import("@/app/api/admin/version-status/route");
    const res = await GET(req, { params: Promise.resolve({}) } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.latest).toBe("0.3.0");
    expect(body.updateAvailable).toBe(true);
    expect(getUpdateStatus).toHaveBeenCalledOnce();
  });

  it("forbids (403) a user WITHOUT any admin permission", async () => {
    const req = await requestForUser([{ name: "projects.create", allow: true }]);

    const { GET } = await import("@/app/api/admin/version-status/route");

    // The permission guard rejects with an HttpError carrying statusCode 403
    // before the handler (and thus getUpdateStatus) ever runs.
    await expect(
      GET(req, { params: Promise.resolve({}) } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(getUpdateStatus).not.toHaveBeenCalled();
  });
});
