import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let svc: typeof import("@/lib/services/minecraft-version.service");

beforeEach(async () => {
  vi.resetModules();
  svc = await import("@/lib/services/minecraft-version.service");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getLatestRelease", () => {
  it("returns latest.release from the Mojang manifest", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ latest: { release: "1.21.4", snapshot: "24w44a" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const latest = await svc.getLatestRelease();

    expect(latest).toBe("1.21.4");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("serves a cached value on the second call without re-fetching", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ latest: { release: "1.21.4" } }), { status: 200 }),
    );

    await svc.getLatestRelease();
    const second = await svc.getLatestRelease();

    expect(second).toBe("1.21.4");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when the Mojang fetch fails (no prior cache)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(svc.getLatestRelease()).rejects.toThrow();
  });
});
