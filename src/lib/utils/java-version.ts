/**
 * Standard Minecraft version → minimum required Java version mapping.
 * Returns the lowest Java version that satisfies the requirement.
 * Available itzg JAVA_VERSION values: "8", "11", "17", "21", "25"
 */
export const JAVA_VERSIONS = ["8", "11", "17", "21", "25"] as const;
export type JavaVersion = (typeof JAVA_VERSIONS)[number];

export function inferJavaVersion(mcVersion: string | undefined | null): JavaVersion {
  if (!mcVersion) return "21";

  // Parse numeric parts (e.g. "1.21.1" → [1, 21, 1], "26.1.1" → [26, 1, 1])
  const parts = mcVersion.split(".").map(Number);
  const major = parts[0] ?? 1;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  // New versioning scheme (e.g. 25.x.x, 26.x.x): all require Java 25
  if (major !== 1) return "25";

  // MC 1.20.5+ requires Java 21
  if (minor > 20 || (minor === 20 && patch >= 5)) return "21";
  // MC 1.18–1.20.4 requires Java 17
  if (minor >= 18) return "17";
  // MC 1.17 requires Java 16 — map to 17 (superset)
  if (minor === 17) return "17";
  // MC 1.12–1.16: Java 8
  return "8";
}
