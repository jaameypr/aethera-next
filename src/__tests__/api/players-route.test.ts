import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the players service — the route test verifies auth + permission + shape,
// not the underlying file/console logic (covered in the service test).
// ---------------------------------------------------------------------------

const mockListPlayers = vi.fn();
const mockIsWhitelistEnabled = vi.fn();
const mockAddWhitelist = vi.fn();
const mockRemoveWhitelist = vi.fn();
const mockAddOp = vi.fn();
const mockRemoveOp = vi.fn();
const mockSetWhitelistEnabled = vi.fn();

vi.mock("@/lib/services/minecraft-players.service", () => ({
  listPlayers: mockListPlayers,
  isWhitelistEnabled: mockIsWhitelistEnabled,
  addWhitelist: mockAddWhitelist,
  removeWhitelist: mockRemoveWhitelist,
  addOp: mockAddOp,
  removeOp: mockRemoveOp,
  setWhitelistEnabled: mockSetWhitelistEnabled,
}));

// ---------------------------------------------------------------------------
// Setup — real Mongo + real auth guard (sign access_token cookie).
// ---------------------------------------------------------------------------

let UserModel: typeof import("@/lib/db/models/user").UserModel;
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;
let signAccessToken: typeof import("@/lib/auth/jwt").signAccessToken;

let mongo: MongoMemoryServer;

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = "test-jwt-secret-that-is-long-enough-for-hmac-256";
  process.env.JWT_ISSUER = "aethera-test";
  process.env.JWT_ACCESS_TTL = "15m";

  await (await import("@/lib/db/connection")).connectDB();
  UserModel = (await import("@/lib/db/models/user")).UserModel;
  ProjectModel = (await import("@/lib/db/models/project")).ProjectModel;
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  signAccessToken = (await import("@/lib/auth/jwt")).signAccessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await UserModel.deleteMany({});
  await ProjectModel.deleteMany({});
  await ServerModel.deleteMany({});
  vi.clearAllMocks();
});

interface Seeded {
  serverId: string;
  ownerToken: string;
  outsiderToken: string;
}

async function seed(): Promise<Seeded> {
  const ownerId = new mongoose.Types.ObjectId();
  const outsiderId = new mongoose.Types.ObjectId();

  await UserModel.create({
    _id: ownerId,
    username: "owner",
    email: "owner@test.com",
    passwordHash: "x",
    roles: [],
  });
  await UserModel.create({
    _id: outsiderId,
    username: "outsider",
    email: "outsider@test.com",
    passwordHash: "x",
    roles: [],
  });

  await ProjectModel.create({
    name: "Proj",
    key: "proj",
    owner: ownerId,
    members: [],
  });

  const server = await ServerModel.create({
    name: "MC",
    projectKey: "proj",
    identifier: "mc",
    runtime: "minecraft",
    image: "itzg/minecraft-server",
    tag: "stable",
    port: 25565,
    memory: 2048,
    status: "running",
    access: [],
  });

  const { token: ownerToken } = await signAccessToken(ownerId.toString(), []);
  const { token: outsiderToken } = await signAccessToken(
    outsiderId.toString(),
    [],
  );

  return { serverId: String(server._id), ownerToken, outsiderToken };
}

function makeReq(
  serverId: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {
    Cookie: `access_token=${token}`,
    "Content-Type": "application/json",
  };
  return new NextRequest(`http://localhost/api/servers/${serverId}/players`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
}

const ctx = (serverId: string) => ({ params: Promise.resolve({ id: serverId }) });

// ---------------------------------------------------------------------------
// GET /players
// ---------------------------------------------------------------------------

describe("GET /api/servers/[id]/players", () => {
  it("returns the players + whitelistEnabled shape for the owner", async () => {
    const { serverId, ownerToken } = await seed();
    mockListPlayers.mockResolvedValue({
      running: true,
      whitelist: [{ uuid: "u1", name: "Alice" }],
      ops: [{ uuid: "u2", name: "Bob", level: 4 }],
    });
    mockIsWhitelistEnabled.mockResolvedValue(true);

    const { GET } = await import("@/app/api/servers/[id]/players/route");
    const res = await GET(makeReq(serverId, ownerToken), ctx(serverId));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      running: true,
      whitelist: [{ uuid: "u1", name: "Alice" }],
      ops: [{ uuid: "u2", name: "Bob", level: 4 }],
      whitelistEnabled: true,
    });
  });

  it("rejects a user without server.settings on that server (403)", async () => {
    const { serverId, outsiderToken } = await seed();

    const { GET } = await import("@/app/api/servers/[id]/players/route");
    const res = await GET(makeReq(serverId, outsiderToken), ctx(serverId));

    expect(res.status).toBe(403);
    expect(mockListPlayers).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request (401)", async () => {
    const { serverId } = await seed();
    const { GET } = await import("@/app/api/servers/[id]/players/route");
    const req = new NextRequest(
      `http://localhost/api/servers/${serverId}/players`,
    );
    const res = await GET(req, ctx(serverId));
    expect(res.status).toBe(401);
  });

  it("returns 404 for a missing server", async () => {
    const { ownerToken } = await seed();
    const missing = new mongoose.Types.ObjectId().toString();
    const { GET } = await import("@/app/api/servers/[id]/players/route");
    const res = await GET(makeReq(missing, ownerToken), ctx(missing));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /players/whitelist
// ---------------------------------------------------------------------------

describe("POST /api/servers/[id]/players/whitelist", () => {
  it("adds to the whitelist and returns the refreshed list", async () => {
    const { serverId, ownerToken } = await seed();
    mockAddWhitelist.mockResolvedValue(undefined);
    mockListPlayers.mockResolvedValue({
      running: true,
      whitelist: [{ uuid: "u1", name: "Notch" }],
      ops: [],
    });
    mockIsWhitelistEnabled.mockResolvedValue(false);

    const { POST } = await import(
      "@/app/api/servers/[id]/players/whitelist/route"
    );
    const res = await POST(
      makeReq(serverId, ownerToken, { method: "POST", body: { name: "Notch" } }),
      ctx(serverId),
    );

    expect(res.status).toBe(200);
    expect(mockAddWhitelist).toHaveBeenCalledWith(serverId, "Notch");
    const body = await res.json();
    expect(body.whitelist).toEqual([{ uuid: "u1", name: "Notch" }]);
  });
});
