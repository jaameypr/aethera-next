import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  resolveProfile,
  offlineUuid,
  dashifyUuid,
} from "@/lib/services/mojang.service";

const DASHED_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("dashifyUuid", () => {
  it("converts a 32-char undashed hex into a dashed UUID", () => {
    expect(dashifyUuid("069a79f444e94726a5befca90e38aaf5")).toBe(
      "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    );
  });
});

describe("offlineUuid", () => {
  it("returns the canonical offline-mode UUID for a known name", () => {
    // Verified against Java UUID.nameUUIDFromBytes("OfflinePlayer:Notch")
    expect(offlineUuid("Notch")).toBe("b50ad385-829d-3141-a216-7e7d7539ba7f");
  });

  it("is deterministic and matches the v3 dashed shape", () => {
    const a = offlineUuid("SomePlayer");
    const b = offlineUuid("SomePlayer");
    expect(a).toBe(b);
    expect(a).toMatch(DASHED_RE);
  });
});

describe("resolveProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a dashed uuid + canonical name on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          id: "069a79f444e94726a5befca90e38aaf5",
          name: "Notch",
        }),
      }),
    );

    const profile = await resolveProfile("Notch");
    expect(profile).toEqual({
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
      name: "Notch",
    });
  });

  it("returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    expect(await resolveProfile("DoesNotExist")).toBeNull();
  });

  it("returns null on 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 204, ok: false, json: async () => ({}) }),
    );
    expect(await resolveProfile("Empty")).toBeNull();
  });

  it("throws a clear error on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    );
    await expect(resolveProfile("Anyone")).rejects.toThrow();
  });
});
