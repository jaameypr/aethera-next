/**
 * Standard Minecraft version → minimum required Java version mapping.
 * Returns the lowest Java version that satisfies the requirement.
 * Available itzg JAVA_VERSION values: "8", "11", "17", "21", "25"
 */
export const JAVA_VERSIONS = ["8", "11", "17", "21", "25"] as const;
export type JavaVersion = (typeof JAVA_VERSIONS)[number];

/** Highest Java version the itzg image supports — the default for "latest" servers. */
export const HIGHEST_JAVA_VERSION: JavaVersion =
  JAVA_VERSIONS[JAVA_VERSIONS.length - 1];

/**
 * Maps a snapshot id (e.g. "24w44a") to a Java version by year+week.
 * Boundaries follow Mojang's dev cycles:
 *   ≥ 24w14            → "21" (1.20.5+ cycle)
 *   21w19 .. 24w13     → "17" (1.18–1.20.4 cycle)
 *   20w06 .. 21w18     → "17" (1.17 cycle; Java 16 mapped up to 17)
 *   older              → "8"
 */
function inferFromSnapshot(year: number, week: number): JavaVersion {
  const yw = year * 100 + week; // e.g. 24w44 → 2444
  if (yw >= 2414) return "21";
  if (yw >= 2119) return "17";
  if (yw >= 2006) return "17";
  return "8";
}

export function inferJavaVersion(mcVersion: string | undefined | null): JavaVersion {
  if (!mcVersion) return "21";

  // "latest" tracks the newest release → use the highest supported Java so the
  // server is future-proof and never needs a JDK downgrade on auto-update.
  if (mcVersion.trim().toLowerCase() === "latest") return HIGHEST_JAVA_VERSION;

  // Strip pre-release / release-candidate / labelled suffixes:
  // everything from the first "-" or whitespace onward (e.g. "1.21.5-rc1", "1.19 Pre-Release").
  const cleaned = mcVersion.trim().split(/[-\s]/)[0];
  if (!cleaned) return "21";

  // Snapshot scheme YYwWWx (e.g. "24w44a").
  const snapshot = /^(\d{2})w(\d{2})[a-z]$/.exec(cleaned);
  if (snapshot) {
    return inferFromSnapshot(Number(snapshot[1]), Number(snapshot[2]));
  }

  // Numeric major.minor.patch (e.g. "1.21.1" → [1, 21, 1], "26.1.2" → [26, 1, 2]).
  const parts = cleaned.split(".").map(Number);
  const major = parts[0];
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  // Unparseable major (garbage, empty) → safe modern default.
  if (major === undefined || Number.isNaN(major)) return "21";

  // New versioning scheme (e.g. 25.x.x, 26.x.x): all require Java 25.
  if (major > 1) return "25";

  // Defensive: anything below the "1.x" line is ancient → Java 8.
  if (major < 1) return "8";

  // Release map for the "1.x" line.
  // MC 1.20.5+ requires Java 21.
  if (minor > 20 || (minor === 20 && patch >= 5)) return "21";
  // MC 1.18–1.20.4 requires Java 17.
  if (minor >= 18) return "17";
  // MC 1.17 requires Java 16 — map to 17 (superset).
  if (minor === 17) return "17";
  // MC 1.12–1.16: Java 8.
  return "8";
}
