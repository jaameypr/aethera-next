import { describe, it, expect } from "vitest";
import { isAtLeast, isNewer, withinRange, isValid } from "@/lib/utils/semver";

describe("semver utils", () => {
  it("isAtLeast returns true when version >= floor", () => {
    expect(isAtLeast("0.2.0", "0.1.0")).toBe(true);
  });

  it("isAtLeast returns false when version < floor", () => {
    expect(isAtLeast("0.1.0", "0.3.0")).toBe(false);
  });

  it("isNewer returns true when a > b", () => {
    expect(isNewer("0.3.0", "0.2.0")).toBe(true);
  });

  it("withinRange returns true when version is within [min, max]", () => {
    expect(withinRange("0.2.0", "0.1.0", "0.2.0")).toBe(true);
  });

  it("withinRange returns false when version exceeds max", () => {
    expect(withinRange("0.3.0", "0.1.0", "0.2.0")).toBe(false);
  });

  it("isValid returns false for non-semver string", () => {
    expect(isValid("nope")).toBe(false);
  });
});
