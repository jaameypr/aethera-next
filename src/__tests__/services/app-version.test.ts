/**
 * Tests for app-version.service.ts
 *
 * Strategy:
 *  - vi.resetModules() + dynamic import between cases so the module-level
 *    cache resets between test groups.
 *  - global fetch is stubbed with vi.stubGlobal("fetch", vi.fn()).
 *  - Env vars are set BEFORE dynamic-importing the service.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeHubResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      current: "0.2.0",
      latest: "0.3.0",
      channel: "stable",
      updateAvailable: true,
      mandatory: false,
      changelog: "Bug fixes",
      imageTag: "0.3.0",
      releaseDate: "2026-06-01",
      ...overrides,
    }),
  } as unknown as Response;
}

// ── suite ─────────────────────────────────────────────────────────────────────

describe("app-version.service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_APP_VERSION;
    delete process.env.AETHERA_HUB_URL;
    delete process.env.AETHERA_CHANNEL;
  });

  // ── (a) Hub returns updateAvailable → reflected ───────────────────────────
  describe("(a) hub returns update info", () => {
    it("returns updateAvailable:true and latest version from hub response", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue(makeHubResponse());
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");
      const result = await getUpdateStatus();

      expect(result.updateAvailable).toBe(true);
      expect(result.latest).toBe("0.3.0");
      expect(result.current).toBe("0.2.0");
      expect(result.mandatory).toBe(false);
      expect(result.changelog).toBe("Bug fixes");
      expect(result.channel).toBe("stable");
      expect(result.imageTag).toBe("0.3.0");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("/api/version/latest");
      expect(calledUrl).toContain("channel=stable");
      expect(calledUrl).toContain("current=0.2.0");
    });

    it("trusts hub updateAvailable:false even when latest > current", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue(
        makeHubResponse({ updateAvailable: false, latest: "0.3.0" })
      );
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");
      const result = await getUpdateStatus();

      expect(result.updateAvailable).toBe(false);
    });

    it("computes updateAvailable via isNewer when hub omits the field", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          current: "0.2.0",
          latest: "0.3.0",
          channel: "stable",
          // updateAvailable intentionally omitted
          mandatory: false,
          changelog: "",
          imageTag: null,
          releaseDate: "2026-06-01",
        }),
      } as unknown as Response);
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");
      const result = await getUpdateStatus();

      // 0.3.0 > 0.2.0, so isNewer should compute true
      expect(result.updateAvailable).toBe(true);
    });
  });

  // ── (b) Network throws → safe default, no throw ───────────────────────────
  describe("(b) network failure → safe default", () => {
    it("returns safe default when fetch throws", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");

      // Must NOT throw
      const result = await expect(getUpdateStatus()).resolves.toBeDefined();
      const status = await (async () => {
        const { getUpdateStatus: get } = await import("@/lib/services/app-version.service");
        return get();
      })();

      expect(status.updateAvailable).toBe(false);
      expect(status.latest).toBeNull();
      expect(status.current).toBe("0.2.0");
      expect(status.mandatory).toBe(false);
      expect(status.changelog).toBe("");
      expect(status.channel).toBe("stable");
      expect(status.imageTag).toBeNull();
      expect(status.checkedAt).toBeDefined();
    });

    it("returns safe default when fetch returns non-ok response", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => { throw new Error("not json"); },
      } as unknown as Response);
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");
      const result = await getUpdateStatus();

      expect(result.updateAvailable).toBe(false);
      expect(result.latest).toBeNull();
    });

    it("returns safe default when json() throws", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("invalid json"); },
      } as unknown as Response);
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");
      const result = await getUpdateStatus();

      expect(result.updateAvailable).toBe(false);
      expect(result.latest).toBeNull();
    });
  });

  // ── (c) Caching: second call within TTL does not re-fetch ─────────────────
  describe("(c) caching behaviour", () => {
    it("does not re-fetch within TTL — fetch called only once", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue(makeHubResponse());
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");

      await getUpdateStatus();
      await getUpdateStatus();
      await getUpdateStatus();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("forceRefresh:true bypasses the cache and re-fetches", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.AETHERA_HUB_URL = "https://hub.test";
      process.env.AETHERA_CHANNEL = "stable";

      const mockFetch = vi.fn().mockResolvedValue(makeHubResponse());
      vi.stubGlobal("fetch", mockFetch);

      const { getUpdateStatus } = await import("@/lib/services/app-version.service");

      await getUpdateStatus();                    // call 1 — populates cache
      await getUpdateStatus();                    // call 2 — uses cache
      await getUpdateStatus(true);               // call 3 — forceRefresh, re-fetches

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── getCurrentVersion ──────────────────────────────────────────────────────
  describe("getCurrentVersion()", () => {
    it("returns APP_VERSION", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "1.2.3";

      const { getCurrentVersion } = await import("@/lib/services/app-version.service");
      expect(getCurrentVersion()).toBe("1.2.3");
    });
  });
});
