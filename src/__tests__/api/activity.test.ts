import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const SESSION = { userId: "u1", roles: [] };

vi.mock("@/lib/auth/guards", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { session: typeof SESSION; params: Record<string, string> }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { session: SESSION, params: {} }),
}));

const getUnreadSummary = vi.fn();
const getGlobalRecent = vi.fn();
const markSeen = vi.fn();
vi.mock("@/lib/services/activity.service", () => ({
  getUnreadSummary,
  getGlobalRecent,
  markSeen,
}));

const getProject = vi.fn();
vi.mock("@/lib/services/project.service", () => ({ getProject }));

beforeEach(() => {
  getUnreadSummary.mockReset();
  getGlobalRecent.mockReset();
  markSeen.mockReset();
  getProject.mockReset();
});

describe("GET /api/activity/unread", () => {
  it("returns the unread summary for the session user", async () => {
    getUnreadSummary.mockResolvedValue({ total: 3, perProject: { "proj-a": 3 } });
    const { GET } = await import("@/app/api/activity/unread/route");

    const res = await GET({ url: "http://localhost/api/activity/unread" } as NextRequest, {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 3, perProject: { "proj-a": 3 } });
    expect(getUnreadSummary).toHaveBeenCalledWith("u1");
  });
});

describe("GET /api/activity/recent", () => {
  it("returns recent entries for the session user", async () => {
    getGlobalRecent.mockResolvedValue([
      {
        _id: "log1",
        projectKey: "proj-a",
        action: "SERVER_STARTED",
        actorUsername: "alice",
        details: {},
        createdAt: "2026-06-04T00:00:00.000Z",
      },
    ]);
    const { GET } = await import("@/app/api/activity/recent/route");

    const res = await GET({ url: "http://localhost/api/activity/recent" } as NextRequest, {
      params: Promise.resolve({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].actorUsername).toBe("alice");
    expect(getGlobalRecent).toHaveBeenCalledWith("u1");
  });
});

describe("POST /api/activity/seen", () => {
  it("marks the project seen for members and returns 204", async () => {
    getProject.mockResolvedValue({
      owner: { toString: () => "owner-x" },
      members: [{ userId: { toString: () => "u1" } }],
    });
    const { POST } = await import("@/app/api/activity/seen/route");

    const res = await POST(
      {
        json: async () => ({ projectKey: "proj-a" }),
      } as unknown as NextRequest,
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(204);
    expect(markSeen).toHaveBeenCalledWith("u1", "proj-a");
  });

  it("rejects non-members with 403 and does not mark seen", async () => {
    getProject.mockResolvedValue({
      owner: { toString: () => "owner-x" },
      members: [],
    });
    const { POST } = await import("@/app/api/activity/seen/route");

    const res = await POST(
      {
        json: async () => ({ projectKey: "proj-a" }),
      } as unknown as NextRequest,
      { params: Promise.resolve({}) },
    );

    expect(res.status).toBe(403);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("returns 400 when projectKey is missing", async () => {
    const { POST } = await import("@/app/api/activity/seen/route");
    const res = await POST(
      { json: async () => ({}) } as unknown as NextRequest,
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(400);
  });
});
