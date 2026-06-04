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

beforeEach(() => {
  getUnreadSummary.mockReset();
  getGlobalRecent.mockReset();
  markSeen.mockReset();
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
