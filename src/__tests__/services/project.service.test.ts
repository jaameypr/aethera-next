import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

// Must import after setup.ts mocks "server-only"
let projectService: typeof import("@/lib/services/project.service");
let ProjectModel: typeof import("@/lib/db/models/project").ProjectModel;
let ProjectLogModel: typeof import("@/lib/db/models/project-log").ProjectLogModel;

let mongo: MongoMemoryServer;
const ACTOR_ID = new mongoose.Types.ObjectId().toString();
const OTHER_USER = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  // Reset any cached mongoose connection from other test files
  await mongoose.disconnect();
  global.mongooseConnection = { conn: null, promise: null };

  mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  process.env.MONGODB_URI = uri;

  // Establish connection before importing services
  const { connectDB } = await import("@/lib/db/connection");
  await connectDB();

  // Dynamic import so MONGODB_URI is set before connectDB runs
  projectService = await import("@/lib/services/project.service");
  const projectModels = await import("@/lib/db/models/project");
  ProjectModel = projectModels.ProjectModel;
  const logModels = await import("@/lib/db/models/project-log");
  ProjectLogModel = logModels.ProjectLogModel;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await ProjectModel.deleteMany({});
  await ProjectLogModel.deleteMany({});
});

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe("createProject", () => {
  it("creates a project with valid data", async () => {
    const project = await projectService.createProject({
      name: "Test Project",
      key: "test-project",
      owner: ACTOR_ID,
    });

    expect(project.name).toBe("Test Project");
    expect(project.key).toBe("test-project");
    expect(String(project.owner)).toBe(ACTOR_ID);
  });

  it("rejects duplicate keys", async () => {
    await projectService.createProject({
      name: "First",
      key: "dup-key",
      owner: ACTOR_ID,
    });

    await expect(
      projectService.createProject({
        name: "Second",
        key: "dup-key",
        owner: ACTOR_ID,
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid key format", async () => {
    await expect(
      projectService.createProject({
        name: "Bad Key",
        key: "Invalid Key!",
        owner: ACTOR_ID,
      }),
    ).rejects.toThrow();
  });
});

describe("getProject", () => {
  it("returns the project by key", async () => {
    await projectService.createProject({
      name: "Find Me",
      key: "find-me",
      owner: ACTOR_ID,
    });

    const found = await projectService.getProject("find-me");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find Me");
  });

  it("returns null for non-existent key", async () => {
    const result = await projectService.getProject("nope");
    expect(result).toBeNull();
  });
});

describe("renameProject", () => {
  it("updates the project name", async () => {
    await projectService.createProject({
      name: "Old Name",
      key: "rename-me",
      owner: ACTOR_ID,
    });

    const updated = await projectService.renameProject("rename-me", "New Name");
    expect(updated.name).toBe("New Name");
    expect(updated.key).toBe("rename-me"); // key unchanged
  });
});

describe("deleteProject", () => {
  it("deletes with correct confirmation name", async () => {
    await projectService.createProject({
      name: "To Delete",
      key: "to-delete",
      owner: ACTOR_ID,
    });

    await projectService.deleteProject("to-delete", "To Delete");
    const found = await projectService.getProject("to-delete");
    expect(found).toBeNull();
  });

  it("rejects wrong confirmation name", async () => {
    await projectService.createProject({
      name: "Protected",
      key: "protected",
      owner: ACTOR_ID,
    });

    await expect(
      projectService.deleteProject("protected", "wrong name"),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

describe("addMember / removeMember", () => {
  const PROJECT_KEY = "members-test";

  beforeEach(async () => {
    await projectService.createProject({
      name: "Members Test",
      key: PROJECT_KEY,
      owner: ACTOR_ID,
    });
  });

  it("adds a member", async () => {
    await projectService.addMember(PROJECT_KEY, OTHER_USER, "member");

    const project = await projectService.getProject(PROJECT_KEY);
    expect(project!.members).toHaveLength(1);
    expect(String(project!.members[0].userId)).toBe(OTHER_USER);
    expect(project!.members[0].role).toBe("member");
  });

  it("removes a member", async () => {
    await projectService.addMember(PROJECT_KEY, OTHER_USER, "admin");
    await projectService.removeMember(PROJECT_KEY, OTHER_USER);

    const project = await projectService.getProject(PROJECT_KEY);
    expect(project!.members).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

describe("listProjects", () => {
  it("returns projects where user is owner", async () => {
    await projectService.createProject({
      name: "Owned",
      key: "owned",
      owner: ACTOR_ID,
    });
    await projectService.createProject({
      name: "Other",
      key: "other",
      owner: OTHER_USER,
    });

    const list = await projectService.listProjects(ACTOR_ID);
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe("owned");
  });

  it("returns projects where user is member", async () => {
    await projectService.createProject({
      name: "Member Project",
      key: "member-proj",
      owner: OTHER_USER,
    });
    await projectService.addMember("member-proj", ACTOR_ID, "member");

    const list = await projectService.listProjects(ACTOR_ID);
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe("member-proj");
  });
});

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

describe("logAction / getProjectLogs", () => {
  const PROJECT_KEY = "log-test";

  beforeEach(async () => {
    await projectService.createProject({
      name: "Log Test",
      key: PROJECT_KEY,
      owner: ACTOR_ID,
    });
  });

  it("logs an action and retrieves it", async () => {
    await projectService.logAction(
      PROJECT_KEY,
      "SERVER_CREATED",
      ACTOR_ID,
      { serverName: "mc-1" },
    );

    const logs = await projectService.getProjectLogs(PROJECT_KEY, {
      page: 1,
      size: 10,
    });

    expect(logs.total).toBe(1);
    expect(logs.entries).toHaveLength(1);
    expect(logs.entries[0].action).toBe("SERVER_CREATED");
    expect(logs.entries[0].details).toMatchObject({ serverName: "mc-1" });
  });

  it("paginates log entries", async () => {
    for (let i = 0; i < 5; i++) {
      await projectService.logAction(PROJECT_KEY, "SERVER_STARTED", ACTOR_ID);
    }

    const page1 = await projectService.getProjectLogs(PROJECT_KEY, {
      page: 1,
      size: 2,
    });
    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = await projectService.getProjectLogs(PROJECT_KEY, {
      page: 3,
      size: 2,
    });
    expect(page3.entries).toHaveLength(1);
  });
});
