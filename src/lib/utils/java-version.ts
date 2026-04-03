/**
 * Standard Minecraft version → minimum required Java version mapping.
 * Returns the lowest Java version that satisfies the requirement.
 * Available itzg JAVA_VERSION values: "8", "11", "17", "21"
 */
export const JAVA_VERSIONS = ["8", "11", "17", "21"] as const;
export type JavaVersion = (typeof JAVA_VERSIONS)[number];

export function inferJavaVersion(mcVersion: string | undefined | null): JavaVersion {
  if (!mcVersion) return "21";

  // Parse the major.minor part (e.g. "1.21.1" → [1, 21])
  const parts = mcVersion.split(".").map(Number);
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  // MC 1.20.5+ requires Java 21
  if (minor > 20 || (minor === 20 && patch >= 5)) return "21";
  // MC 1.18–1.20.4 requires Java 17
  if (minor >= 18) return "17";
  // MC 1.17 requires Java 16 — map to 17 (superset)
  if (minor === 17) return "17";
  // MC 1.12–1.16: Java 8
  return "8";
}
