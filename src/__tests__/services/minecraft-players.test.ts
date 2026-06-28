import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------
// Mocks — file.service, server.service (console), mojang
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
vi.mock("@/lib/services/file.service", () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

const mockSendConsoleCommand = vi.fn();
// Keep getServer real (it reads the seeded Mongo doc); only stub the console.
vi.mock("@/lib/services/server.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/server.service")>();
  return { ...actual, sendConsoleCommand: mockSendConsoleCommand };
});

const mockResolveProfile = vi.fn();
const mockOfflineUuid = vi.fn();
vi.mock("@/lib/services/mojang.service", () => ({
  resolveProfile: mockResolveProfile,
  offlineUuid: mockOfflineUuid,
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let svc: typeof import("@/lib/services/minecraft-players.service");
let ServerModel: typeof import("@/lib/db/models/server").ServerModel;

let mongo: MongoMemoryServer;
const PROJECT_KEY = "test-project";

beforeAll(async () => {
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();

  svc = await import("@/lib/services/minecraft-players.service");
  ServerModel = (await import("@/lib/db/models/server")).ServerModel;
  await (await import("@/lib/db/connection")).connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await ServerModel.deleteMany({});
  vi.clearAllMocks();
  mockResolveProfile.mockResolvedValue(null);
  mockOfflineUuid.mockReturnValue("00000000-0000-3000-8000-000000000000");
});

async function seedServer(status: "running" | "stopped") {
  const server = await ServerModel.create({
    name: "MC",
    projectKey: PROJECT_KEY,
    identifier: "mc",
    runtime: "minecraft",
    image: "itzg/minecraft-server",
    tag: "stable",
    port: 25565,
    memory: 2048,
    status,
    ...(status === "running" ? { containerId: "c-1" } : {}),
  });
  return String(server._id);
}

// ---------------------------------------------------------------------------
// listPlayers
// ---------------------------------------------------------------------------

describe("listPlayers", () => {
  it("parses whitelist.json and ops.json", async () => {
    const id = await seedServer("running");
    mockReadFile.mockImplementation(async (_id: string, file: string) => {
      if (file === "whitelist.json")
        return { content: JSON.stringify([{ uuid: "u1", name: "Alice" }]), size: 1 };
      if (file === "ops.json")
        return {
          content: JSON.stringify([
            { uuid: "u2", name: "Bob", level: 4, bypassesPlayerLimit: false },
          ]),
          size: 1,
        };
      throw new Error("not found");
    });

    const result = await svc.listPlayers(id);
    expect(result.running).toBe(true);
    expect(result.whitelist).toEqual([{ uuid: "u1", name: "Alice" }]);
    expect(result.ops).toEqual([{ uuid: "u2", name: "Bob", level: 4 }]);
  });

  it("returns empty arrays when the files are missing", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await svc.listPlayers(id);
    expect(result.running).toBe(false);
    expect(result.whitelist).toEqual([]);
    expect(result.ops).toEqual([]);
  });

  it("returns empty arrays when the JSON is corrupt", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({ content: "{ not json", size: 1 });

    const result = await svc.listPlayers(id);
    expect(result.whitelist).toEqual([]);
    expect(result.ops).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addWhitelist
// ---------------------------------------------------------------------------

describe("addWhitelist", () => {
  it("running → sends console command and does NOT write the file", async () => {
    const id = await seedServer("running");
    mockResolveProfile.mockResolvedValue({ uuid: "real-uuid", name: "Notch" });

    await svc.addWhitelist(id, "Notch");

    expect(mockSendConsoleCommand).toHaveBeenCalledWith(id, "whitelist add Notch");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("stopped → writes whitelist.json with the resolved uuid and does NOT call console", async () => {
    const id = await seedServer("stopped");
    mockResolveProfile.mockResolvedValue({
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      name: "Notch",
    });
    mockReadFile.mockRejectedValue(new Error("ENOENT")); // no existing file

    await svc.addWhitelist(id, "Notch");

    expect(mockSendConsoleCommand).not.toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, file, content] = mockWriteFile.mock.calls[0];
    expect(file).toBe("whitelist.json");
    const parsed = JSON.parse(content);
    expect(parsed).toEqual([
      { uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5", name: "Notch" },
    ]);
  });

  it("stopped → falls back to the offline uuid when Mojang can't resolve", async () => {
    const id = await seedServer("stopped");
    mockResolveProfile.mockResolvedValue(null);
    mockOfflineUuid.mockReturnValue("b50ad385-829d-3141-a216-7e7d7539ba7f");
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    await svc.addWhitelist(id, "Notch");

    const [, , content] = mockWriteFile.mock.calls[0];
    expect(JSON.parse(content)[0].uuid).toBe(
      "b50ad385-829d-3141-a216-7e7d7539ba7f",
    );
  });

  it("stopped → dedupes by lowercased name", async () => {
    const id = await seedServer("stopped");
    mockResolveProfile.mockResolvedValue({ uuid: "u", name: "Notch" });
    mockReadFile.mockResolvedValue({
      content: JSON.stringify([{ uuid: "old", name: "notch" }]),
      size: 1,
    });

    await svc.addWhitelist(id, "Notch");

    const [, , content] = mockWriteFile.mock.calls[0];
    expect(JSON.parse(content)).toHaveLength(1);
  });

  it("rejects an invalid username", async () => {
    const id = await seedServer("stopped");
    await expect(svc.addWhitelist(id, "bad name!")).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeWhitelist
// ---------------------------------------------------------------------------

describe("removeWhitelist", () => {
  it("running → sends whitelist remove command", async () => {
    const id = await seedServer("running");
    await svc.removeWhitelist(id, "Notch");
    expect(mockSendConsoleCommand).toHaveBeenCalledWith(id, "whitelist remove Notch");
  });

  it("stopped → filters out by lowercased name and writes", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({
      content: JSON.stringify([
        { uuid: "u1", name: "Notch" },
        { uuid: "u2", name: "Keep" },
      ]),
      size: 1,
    });

    await svc.removeWhitelist(id, "notch");

    const [, , content] = mockWriteFile.mock.calls[0];
    expect(JSON.parse(content)).toEqual([{ uuid: "u2", name: "Keep" }]);
  });
});

// ---------------------------------------------------------------------------
// addOp / removeOp
// ---------------------------------------------------------------------------

describe("addOp", () => {
  it("running → sends op command and does NOT write the file", async () => {
    const id = await seedServer("running");
    mockResolveProfile.mockResolvedValue({ uuid: "u", name: "Notch" });

    await svc.addOp(id, "Notch");

    expect(mockSendConsoleCommand).toHaveBeenCalledWith(id, "op Notch");
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("stopped → upserts ops.json with the chosen level", async () => {
    const id = await seedServer("stopped");
    mockResolveProfile.mockResolvedValue({
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      name: "Notch",
    });
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    await svc.addOp(id, "Notch", 3);

    expect(mockSendConsoleCommand).not.toHaveBeenCalled();
    const [, file, content] = mockWriteFile.mock.calls[0];
    expect(file).toBe("ops.json");
    expect(JSON.parse(content)).toEqual([
      {
        uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
        name: "Notch",
        level: 3,
        bypassesPlayerLimit: false,
      },
    ]);
  });
});

describe("removeOp", () => {
  it("running → sends deop command", async () => {
    const id = await seedServer("running");
    await svc.removeOp(id, "Notch");
    expect(mockSendConsoleCommand).toHaveBeenCalledWith(id, "deop Notch");
  });

  it("stopped → filters out and writes", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({
      content: JSON.stringify([
        { uuid: "u1", name: "Notch", level: 4, bypassesPlayerLimit: false },
        { uuid: "u2", name: "Keep", level: 4, bypassesPlayerLimit: false },
      ]),
      size: 1,
    });

    await svc.removeOp(id, "Notch");

    const [, , content] = mockWriteFile.mock.calls[0];
    expect(JSON.parse(content)).toEqual([
      { uuid: "u2", name: "Keep", level: 4, bypassesPlayerLimit: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// setOpLevel
// ---------------------------------------------------------------------------

describe("setOpLevel", () => {
  it("updates the matching op's level in ops.json (by exact name)", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({
      content: JSON.stringify([
        { uuid: "u1", name: "Notch", level: 4, bypassesPlayerLimit: false },
        { uuid: "u2", name: "Jeb", level: 4, bypassesPlayerLimit: false },
      ]),
      size: 1,
    });

    await svc.setOpLevel(id, "Notch", 2);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, file, content] = mockWriteFile.mock.calls[0];
    expect(file).toBe("ops.json");
    const parsed = JSON.parse(content) as { name: string; level: number }[];
    expect(parsed.find((e) => e.name === "Notch")?.level).toBe(2);
    // Other entries are untouched.
    expect(parsed.find((e) => e.name === "Jeb")?.level).toBe(4);
  });

  it("is case-insensitive when matching the player name", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({
      content: JSON.stringify([
        { uuid: "u1", name: "notch", level: 4, bypassesPlayerLimit: false },
      ]),
      size: 1,
    });

    await svc.setOpLevel(id, "NOTCH", 1);

    const [, , content] = mockWriteFile.mock.calls[0];
    const parsed = JSON.parse(content) as { name: string; level: number }[];
    expect(parsed[0].level).toBe(1);
  });

  it("rejects when the player is not in ops.json", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({
      content: JSON.stringify([
        { uuid: "u1", name: "Notch", level: 4, bypassesPlayerLimit: false },
      ]),
      size: 1,
    });

    await expect(svc.setOpLevel(id, "Unknown", 2)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects level 0 (below minimum)", async () => {
    const id = await seedServer("stopped");
    await expect(svc.setOpLevel(id, "Notch", 0)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects level 5 (above maximum)", async () => {
    const id = await seedServer("stopped");
    await expect(svc.setOpLevel(id, "Notch", 5)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("rejects a non-integer level (3.5)", async () => {
    const id = await seedServer("stopped");
    await expect(svc.setOpLevel(id, "Notch", 3.5)).rejects.toThrow();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// whitelist enabled
// ---------------------------------------------------------------------------

describe("setWhitelistEnabled / isWhitelistEnabled", () => {
  it("running → sends whitelist on/off", async () => {
    const id = await seedServer("running");
    await svc.setWhitelistEnabled(id, true);
    expect(mockSendConsoleCommand).toHaveBeenCalledWith(id, "whitelist on");
    await svc.setWhitelistEnabled(id, false);
    expect(mockSendConsoleCommand).toHaveBeenCalledWith(id, "whitelist off");
  });

  it("stopped → edits server.properties white-list key", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({
      content: "white-list=false\nmotd=hi\n",
      size: 1,
    });

    await svc.setWhitelistEnabled(id, true);

    const [, file, content] = mockWriteFile.mock.calls[0];
    expect(file).toBe("server.properties");
    expect(content).toContain("white-list=true");
    expect(content).not.toContain("white-list=false");
  });

  it("stopped → appends white-list key when absent", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({ content: "motd=hi\n", size: 1 });

    await svc.setWhitelistEnabled(id, true);

    const [, , content] = mockWriteFile.mock.calls[0];
    expect(content).toMatch(/white-list=true/);
  });

  it("isWhitelistEnabled parses the property (true)", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockResolvedValue({ content: "white-list=true\n", size: 1 });
    expect(await svc.isWhitelistEnabled(id)).toBe(true);
  });

  it("isWhitelistEnabled defaults to false when absent", async () => {
    const id = await seedServer("stopped");
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    expect(await svc.isWhitelistEnabled(id)).toBe(false);
  });
});
