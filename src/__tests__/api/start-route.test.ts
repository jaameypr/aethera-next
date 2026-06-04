import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockBegin = vi.fn();
const mockGetServer = vi.fn();
vi.mock("@/lib/services/server.service", () => ({
  getServer: mockGetServer,
  beginStartServer: mockBegin,
}));
vi.mock("@/lib/services/server-access", () => ({
  assertServerPermission: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth/guards", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: { session: { userId: string }; params: { id: string } }) => unknown) =>
    (req: NextRequest, params: { id: string }) =>
      handler(req, { session: { userId: "u1" }, params }),
}));

let route: typeof import("@/app/api/servers/[id]/start/route");

beforeEach(async () => {
  vi.clearAllMocks();
  mockGetServer.mockResolvedValue({ _id: "s1" });
  route = await import("@/app/api/servers/[id]/start/route");
});

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/servers/s1/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /start", () => {
  it("passes versionAction from the JSON body", async () => {
    mockBegin.mockResolvedValue(undefined);
    const res = await route.POST(req({ versionAction: "update" }), { id: "s1" });
    expect(res.status).toBe(202);
    expect(mockBegin).toHaveBeenCalledWith("s1", "u1", { versionAction: "update" });
  });

  it("tolerates an empty/absent body", async () => {
    mockBegin.mockResolvedValue(undefined);
    const res = await route.POST(req(), { id: "s1" });
    expect(res.status).toBe(202);
    expect(mockBegin).toHaveBeenCalledWith("s1", "u1", { versionAction: undefined });
  });

  it("maps VersionUpdateAvailableError to 409 with code/current/latest", async () => {
    const { VersionUpdateAvailableError } = await import("@/lib/api/errors");
    mockBegin.mockRejectedValue(new VersionUpdateAvailableError("1.21.3", "1.21.4"));
    const res = await route.POST(req({}), { id: "s1" });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe("VERSION_UPDATE_AVAILABLE");
    expect(json.current).toBe("1.21.3");
    expect(json.latest).toBe("1.21.4");
  });
});
