import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let mongo: MongoMemoryServer;

// Dynamic imports after env setup
let UserModel: typeof import("@/lib/db/models/user").UserModel;
let RoleModel: typeof import("@/lib/db/models/role").RoleModel;
let connectDB: typeof import("@/lib/db/connection").connectDB;

beforeAll(async () => {
  // Reset any cached mongoose connection from other test files
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = "test-jwt-secret-that-is-long-enough-for-hmac-256";
  process.env.JWT_ISSUER = "aethera-test";
  process.env.JWT_ACCESS_TTL = "15m";
  process.env.JWT_REFRESH_TTL = "7d";

  connectDB = (await import("@/lib/db/connection")).connectDB;
  await connectDB();

  UserModel = (await import("@/lib/db/models/user")).UserModel;
  RoleModel = (await import("@/lib/db/models/role")).RoleModel;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await RoleModel.deleteMany({});
  // Clear RefreshToken if it exists
  if (mongoose.models.RefreshToken) {
    await mongoose.models.RefreshToken.deleteMany({});
  }
});

// ---------------------------------------------------------------------------
// Setup endpoint
// ---------------------------------------------------------------------------

describe("GET /api/setup", () => {
  it("reports needsSetup=true when no users exist", async () => {
    const { GET } = await import("@/app/api/setup/route");
    const req = new Request("http://localhost:3000/api/setup", {
      method: "GET",
    });

    const res = await GET(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsSetup).toBe(true);
  });

  it("reports needsSetup=false when users exist", async () => {
    const { createUser } = await import("@/lib/services/user.service");
    await createUser({
      username: "existing",
      email: "existing@test.com",
      password: "password123",
    });

    const { GET } = await import("@/app/api/setup/route");
    const req = new Request("http://localhost:3000/api/setup", {
      method: "GET",
    });

    const res = await GET(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsSetup).toBe(false);
  });
});

describe("POST /api/setup", () => {
  it("creates the first admin user", async () => {
    const { POST } = await import("@/app/api/setup/route");
    const req = new Request("http://localhost:3000/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        email: "admin@test.com",
        password: "securepassword123",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.username).toBe("admin");
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
  });

  it("rejects setup when users already exist", async () => {
    const { createUser } = await import("@/lib/services/user.service");
    await createUser({
      username: "first-admin",
      email: "first@test.com",
      password: "password123",
    });

    const { POST } = await import("@/app/api/setup/route");
    const req = new Request("http://localhost:3000/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "hacker",
        password: "trytosetup",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Login endpoint
// ---------------------------------------------------------------------------

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    const { createUser } = await import("@/lib/services/user.service");
    await createUser({
      username: "testuser",
      email: "test@test.com",
      password: "correctpassword",
      roles: ["user"],
    });
  });

  it("returns tokens on valid credentials", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: "testuser",
        password: "correctpassword",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.username).toBe("testuser");
  });

  it("rejects invalid password", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: "testuser",
        password: "wrongpassword",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("rejects non-existent user", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: "nobody",
        password: "anything",
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Refresh endpoint
// ---------------------------------------------------------------------------

describe("POST /api/auth/refresh", () => {
  it("issues new tokens from a valid refresh token", async () => {
    // Login first to get a refresh token
    const { createUser } = await import("@/lib/services/user.service");
    await createUser({
      username: "refreshuser",
      email: "refresh@test.com",
      password: "password123",
      roles: ["user"],
    });

    const loginRoute = await import("@/app/api/auth/login/route");
    const loginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: "refreshuser",
        password: "password123",
      }),
    });

    const loginRes = await loginRoute.POST(loginReq as any);
    const loginBody = await loginRes.json();
    expect(loginBody.refreshToken).toBeDefined();

    // Now refresh
    const refreshRoute = await import("@/app/api/auth/refresh/route");
    const refreshReq = new Request("http://localhost:3000/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: loginBody.refreshToken }),
    });

    const refreshRes = await refreshRoute.POST(refreshReq as any);
    expect(refreshRes.status).toBe(200);

    const refreshBody = await refreshRes.json();
    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.refreshToken).toBeDefined();
    // New refresh token should differ from the old one
    expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken);
  });

  it("rejects an invalid refresh token", async () => {
    const refreshRoute = await import("@/app/api/auth/refresh/route");
    const req = new Request("http://localhost:3000/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "invalid-token" }),
    });

    const res = await refreshRoute.POST(req as any);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
