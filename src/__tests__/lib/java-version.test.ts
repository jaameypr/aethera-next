import { describe, it, expect } from "vitest";
import { inferJavaVersion, JAVA_VERSIONS } from "@/lib/utils/java-version";

describe("inferJavaVersion", () => {
  it("JAVA_VERSIONS lists the supported itzg values", () => {
    expect(JAVA_VERSIONS).toEqual(["8", "11", "17", "21", "25"]);
  });

  it("maps 1.16.5 → 8 (legacy)", () => {
    expect(inferJavaVersion("1.16.5")).toBe("8");
  });

  it("maps 1.8.8 → 8 (legacy)", () => {
    expect(inferJavaVersion("1.8.8")).toBe("8");
  });

  it("maps 1.17.1 → 17", () => {
    expect(inferJavaVersion("1.17.1")).toBe("17");
  });

  it("maps 1.18.2 → 17", () => {
    expect(inferJavaVersion("1.18.2")).toBe("17");
  });

  it("maps 1.20.4 → 17 (pre-21 cutoff)", () => {
    expect(inferJavaVersion("1.20.4")).toBe("17");
  });

  it("maps 1.20.5 → 21 (21 cutoff)", () => {
    expect(inferJavaVersion("1.20.5")).toBe("21");
  });

  it("maps 1.21.4 → 21", () => {
    expect(inferJavaVersion("1.21.4")).toBe("21");
  });

  it("maps 1.21.11 → 21 (double-digit patch parses normally)", () => {
    expect(inferJavaVersion("1.21.11")).toBe("21");
  });

  it("maps 26.1.2 → 25 (new major scheme)", () => {
    expect(inferJavaVersion("26.1.2")).toBe("25");
  });

  it("maps snapshot 24w44a → 21 (1.20.5+ dev cycle)", () => {
    expect(inferJavaVersion("24w44a")).toBe("21");
  });

  it("maps snapshot 22w13a → 17 (1.18–1.20.4 dev cycle)", () => {
    expect(inferJavaVersion("22w13a")).toBe("17");
  });

  it("strips -rc suffix: 1.21.5-rc1 → 21", () => {
    expect(inferJavaVersion("1.21.5-rc1")).toBe("21");
  });

  it("falls back to 21 for garbage input", () => {
    expect(inferJavaVersion("abc")).toBe("21");
  });

  it("falls back to 21 for empty string", () => {
    expect(inferJavaVersion("")).toBe("21");
  });

  it("falls back to 21 for null", () => {
    expect(inferJavaVersion(null)).toBe("21");
  });
});
