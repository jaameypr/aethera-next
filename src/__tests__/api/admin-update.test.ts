import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
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

// The update service is mocked — this route only guards + relays it. No real
// Docker is ever touched.
const runUpdate = vi.fn();
const conflictError = () => {
  // Mirror the service's 409-mapped error shape.
  const err = Object.assign(new Error("Jobs in flight"), {
    statusCode: 409,
    runningJobs: 1,
  });
  return err;
};
vi.mock("@/lib/services/app-update.service", () => ({
  runUpdate: (...args: unknown[]) => runUpdate(...args),
}));

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
  runUpdate.mockReset();
  runUpdate.mockResolvedValue({ status: "pulled", manual: true, imageTag: "0.3.0" });
});

/** Seed a user holding `permissions`, return a POST NextRequest carrying its token. */
async function requestForUser(
  permissions: { name: string; allow: boolean }[],
  body: unknown = { confirm: true, wait: false },
): Promise<NextRequest> {
  const { user } = await createUser({
    username: "tester",
    email: "tester@test.com",
    password: "password123",
    roles: [],
    permissions,
  });

  const { token } = await signAccessToken(user._id.toString(), []);
  return new NextRequest("http://localhost:3000/api/admin/update", {
    method: "POST",
    headers: {
      cookie: `access_token=${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/update", () => {
  it("forbids a user WITHOUT system.update (guard rejects before the handler runs)", async () => {
    const req = await requestForUser([{ name: "admin.users", allow: true }]);

    const { POST } = await import("@/app/api/admin/update/route");

    await expect(
      POST(req, { params: Promise.resolve({}) } as never),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it("requires confirmation — returns 400 when confirm is missing", async () => {
    const req = await requestForUser([{ name: "system.update", allow: true }], {
      wait: false,
    });

    const { POST } = await import("@/app/api/admin/update/route");
    const res = await POST(req, { params: Promise.resolve({}) } as never);

    expect(res.status).toBe(400);
    expect(runUpdate).not.toHaveBeenCalled();
  });

  it("returns 409 with runningJobs when the system is busy", async () => {
    runUpdate.mockRejectedValue(conflictError());
    const req = await requestForUser([{ name: "system.update", allow: true }]);

    const { POST } = await import("@/app/api/admin/update/route");
    const res = await POST(req, { params: Promise.resolve({}) } as never);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.runningJobs).toBe(1);
    expect(body.error).toBeTruthy();
  });

  it("returns 200 with a status object for a user WITH system.update when not busy", async () => {
    const req = await requestForUser([{ name: "system.update", allow: true }]);

    const { POST } = await import("@/app/api/admin/update/route");
    const res = await POST(req, { params: Promise.resolve({}) } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pulled");
    expect(runUpdate).toHaveBeenCalledOnce();
    // The session userId is forwarded as actorId.
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ wait: false }),
    );
  });
});
