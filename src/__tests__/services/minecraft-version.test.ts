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

import type { IServer } from "@/lib/db/models/server";

const asServer = (o: Partial<IServer>) => o as IServer;

describe("versionTracksLatest", () => {
  it("is true only when version === 'latest'", () => {
    expect(svc.versionTracksLatest(asServer({ version: "latest" }))).toBe(true);
    expect(svc.versionTracksLatest(asServer({ version: "1.21.4" }))).toBe(false);
    expect(svc.versionTracksLatest(asServer({ version: undefined }))).toBe(false);
  });
});

describe("isUpdateAvailable", () => {
  it("is true when current differs from latest", () => {
    expect(svc.isUpdateAvailable("1.21.3", "1.21.4")).toBe(true);
  });
  it("is false when current equals latest", () => {
    expect(svc.isUpdateAvailable("1.21.4", "1.21.4")).toBe(false);
  });
  it("is true when current is null/undefined", () => {
    expect(svc.isUpdateAvailable(null, "1.21.4")).toBe(true);
    expect(svc.isUpdateAvailable(undefined, "1.21.4")).toBe(true);
  });
});

describe("resolveEffectiveVersion", () => {
  it("returns resolvedMinecraftVersion when tracking latest", () => {
    expect(
      svc.resolveEffectiveVersion(asServer({ version: "latest", resolvedMinecraftVersion: "1.21.4" })),
    ).toBe("1.21.4");
  });
  it("returns version when not tracking latest", () => {
    expect(svc.resolveEffectiveVersion(asServer({ version: "1.20.1" }))).toBe("1.20.1");
  });
  it("returns null when tracking latest but unresolved", () => {
    expect(svc.resolveEffectiveVersion(asServer({ version: "latest" }))).toBeNull();
  });
});
