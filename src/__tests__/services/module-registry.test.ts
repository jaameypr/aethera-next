/**
 * Tests for module-registry.service.ts — hub-mode fetch, version gating,
 * and legacy Paperview 3-hop back-compat.
 *
 * Strategy:
 *  - vi.resetModules() + dynamic import between mode-switch cases so the
 *    module-level _cache and getRegistryUrl() re-evaluate against the new env.
 *  - global fetch is stubbed with vi.stubGlobal("fetch", vi.fn()).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeRegistry(modules: unknown[]) {
  return {
    version: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    modules,
  };
}

// ── suite ────────────────────────────────────────────────────────────────────

describe("module-registry.service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    // Reset env between tests
    delete process.env.MODULE_REGISTRY_URL;
    delete process.env.NEXT_PUBLIC_APP_VERSION;
  });

  // ── (a) Hub mode: fetch URL and parse ──────────────────────────────────────
  describe("(a) hub mode", () => {
    it("calls <base>/<APP_VERSION> once and returns the parsed registry", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.MODULE_REGISTRY_URL = "https://h/api/registry";

      const registryPayload = makeRegistry([
        {
          id: "mod-a",
          name: "Mod A",
          description: "",
          author: "",
          icon: "",
          repository: "",
          category: "test",
          tags: [],
          type: "docker",
          versions: [
            {
              version: "1.0.0",
              releaseDate: "2026-01-01",
              minAetheraVersion: "0.1.0",
              changelog: "",
              manifestUrl: "https://h/manifest/1.0.0",
            },
          ],
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(registryPayload));
      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      const result = await fetchRegistry();

      // Should call exactly https://h/api/registry/0.2.0
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe("https://h/api/registry/0.2.0");

      // Returned data should match (after gating, versions pass because 0.2.0 >= 0.1.0)
      expect(result.version).toBe(1);
      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].id).toBe("mod-a");
      expect(result.modules[0].versions[0].version).toBe("1.0.0");
    });

    it("strips trailing slash from base URL before appending version", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.MODULE_REGISTRY_URL = "https://h/api/registry/";

      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(makeRegistry([])));
      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      await fetchRegistry();

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe("https://h/api/registry/0.2.0");
    });
  });

  // ── (b) Version gating ────────────────────────────────────────────────────
  describe("(b) version gating", () => {
    it("keeps version compatible with running panel, drops incompatible one", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.MODULE_REGISTRY_URL = "https://h/api/registry";

      const registryPayload = makeRegistry([
        {
          id: "mod-a",
          name: "Mod A",
          description: "",
          author: "",
          icon: "",
          repository: "",
          category: "test",
          tags: [],
          type: "docker",
          versions: [
            {
              version: "1.0.0",
              releaseDate: "2026-01-01",
              minAetheraVersion: "0.1.0", // 0.2.0 >= 0.1.0 → keep
              changelog: "",
              manifestUrl: "https://h/manifest/1.0.0",
            },
            {
              version: "2.0.0",
              releaseDate: "2026-02-01",
              minAetheraVersion: "0.3.0", // 0.2.0 < 0.3.0 → drop
              changelog: "",
              manifestUrl: "https://h/manifest/2.0.0",
            },
          ],
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(registryPayload));
      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      const result = await fetchRegistry();

      expect(result.modules[0].versions).toHaveLength(1);
      expect(result.modules[0].versions[0].version).toBe("1.0.0");
    });

    it("drops a module entirely when all versions are incompatible", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.MODULE_REGISTRY_URL = "https://h/api/registry";

      const registryPayload = makeRegistry([
        {
          id: "future-mod",
          name: "Future Mod",
          description: "",
          author: "",
          icon: "",
          repository: "",
          category: "test",
          tags: [],
          type: "docker",
          versions: [
            {
              version: "1.0.0",
              releaseDate: "2026-01-01",
              minAetheraVersion: "0.3.0", // 0.2.0 < 0.3.0 → drop
              changelog: "",
              manifestUrl: "https://h/manifest/1.0.0",
            },
          ],
        },
        {
          id: "ok-mod",
          name: "OK Mod",
          description: "",
          author: "",
          icon: "",
          repository: "",
          category: "test",
          tags: [],
          type: "docker",
          versions: [
            {
              version: "1.0.0",
              releaseDate: "2026-01-01",
              minAetheraVersion: "0.1.0",
              changelog: "",
              manifestUrl: "https://h/manifest/1.0.0",
            },
          ],
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(registryPayload));
      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      const result = await fetchRegistry();

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].id).toBe("ok-mod");
    });

    it("excludes a version when minAetheraVersion is missing (invalid semver)", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.MODULE_REGISTRY_URL = "https://h/api/registry";

      const registryPayload = makeRegistry([
        {
          id: "bad-mod",
          name: "Bad Mod",
          description: "",
          author: "",
          icon: "",
          repository: "",
          category: "test",
          tags: [],
          type: "docker",
          versions: [
            {
              version: "1.0.0",
              releaseDate: "2026-01-01",
              minAetheraVersion: "", // empty string → invalid semver → exclude
              changelog: "",
              manifestUrl: "https://h/manifest/1.0.0",
            },
          ],
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(registryPayload));
      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      const result = await fetchRegistry();

      // The module should be dropped because its only version has invalid minAetheraVersion
      expect(result.modules).toHaveLength(0);
    });

    it("respects maxAetheraVersion — excludes version when panel is above max", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.3.0";
      process.env.MODULE_REGISTRY_URL = "https://h/api/registry";

      const registryPayload = makeRegistry([
        {
          id: "capped-mod",
          name: "Capped Mod",
          description: "",
          author: "",
          icon: "",
          repository: "",
          category: "test",
          tags: [],
          type: "docker",
          versions: [
            {
              version: "1.0.0",
              releaseDate: "2026-01-01",
              minAetheraVersion: "0.1.0",
              maxAetheraVersion: "0.2.0", // panel 0.3.0 > max 0.2.0 → exclude
              changelog: "",
              manifestUrl: "https://h/manifest/1.0.0",
            },
          ],
        },
      ]);

      const mockFetch = vi.fn().mockResolvedValue(makeOkResponse(registryPayload));
      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      const result = await fetchRegistry();

      expect(result.modules).toHaveLength(0);
    });
  });

  // ── (c) Legacy 3-hop mode ─────────────────────────────────────────────────
  describe("(c) legacy Paperview mode", () => {
    it("performs the 3-hop fetch and returns the parsed registry", async () => {
      process.env.NEXT_PUBLIC_APP_VERSION = "0.2.0";
      process.env.MODULE_REGISTRY_URL = "https://d/shares/abc";

      const shareMetadata = {
        share: { currentVersionId: "ver-123" },
        versions: [],
      };

      const contentPayload = {
        content: JSON.stringify(
          makeRegistry([
            {
              id: "legacy-mod",
              name: "Legacy Mod",
              description: "",
              author: "",
              icon: "",
              repository: "",
              category: "test",
              tags: [],
              type: "docker",
              versions: [
                {
                  version: "1.0.0",
                  releaseDate: "2026-01-01",
                  minAetheraVersion: "0.1.0",
                  changelog: "",
                  manifestUrl: "https://d/manifest/1.0.0",
                },
              ],
            },
          ])
        ),
      };

      const mockFetch = vi
        .fn()
        // hop 1: share metadata
        .mockResolvedValueOnce(makeOkResponse(shareMetadata))
        // hop 2: version content
        .mockResolvedValueOnce(makeOkResponse(contentPayload));

      vi.stubGlobal("fetch", mockFetch);

      const { fetchRegistry } = await import("@/lib/services/module-registry.service");
      const result = await fetchRegistry();

      // 2 fetches total (metadata + content; JSON.parse is the 3rd "hop" conceptually)
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: the normalized share URL (/api/shares/abc)
      const firstUrl = mockFetch.mock.calls[0][0] as string;
      expect(firstUrl).toContain("/api/shares/abc");

      // Second call: content endpoint
      const secondUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondUrl).toContain("/versions/ver-123/content");

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].id).toBe("legacy-mod");
    });

    it("isLegacyShareUrl returns true for /shares/ URLs", async () => {
      const { isLegacyShareUrl } = await import("@/lib/services/module-registry.service");
      expect(isLegacyShareUrl("https://d/shares/abc")).toBe(true);
      expect(isLegacyShareUrl("https://d/api/shares/abc")).toBe(true);
      expect(isLegacyShareUrl("https://modules.getaethera.de/api/registry")).toBe(false);
    });
  });
});
