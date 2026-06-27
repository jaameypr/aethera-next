import { describe, it, expect } from "vitest";
import { deriveChannel } from "@/lib/version";

describe("deriveChannel", () => {
  it('returns "experimental" for an experimental prerelease', () => {
    expect(deriveChannel("0.0.2-experimental.9")).toBe("experimental");
  });

  it('returns "stable" for a clean release version', () => {
    expect(deriveChannel("0.2.0")).toBe("stable");
  });

  it('returns "edge" for an edge prerelease', () => {
    expect(deriveChannel("1.0.0-edge.3")).toBe("edge");
  });

  it('explicit "stable" override wins over experimental version', () => {
    expect(deriveChannel("0.0.2-experimental.9", "stable")).toBe("stable");
  });

  it('explicit "experimental" override wins over clean release', () => {
    expect(deriveChannel("0.2.0", "experimental")).toBe("experimental");
  });

  it('returns "stable" for the default zero version', () => {
    expect(deriveChannel("0.0.0")).toBe("stable");
  });
});
