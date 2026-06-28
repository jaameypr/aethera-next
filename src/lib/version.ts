/**
 * Runtime version constants — available on both server and client.
 *
 * NEXT_PUBLIC_APP_VERSION is injected at build time by next.config.ts
 * from the `version` field in package.json.
 */

export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/**
 * Derive the update channel from a semver string and an optional explicit
 * override.  Kept dependency-free so it is safe to import on the client.
 *
 * Priority:
 *  1. `envChannel` if it is one of the known channel names.
 *  2. The prerelease segment of `version` (the part after the first `-`):
 *     - contains "experimental" → "experimental"
 *     - contains "edge"         → "edge"
 *     - otherwise               → "stable"
 */
export function deriveChannel(
  version: string,
  envChannel?: string,
): "stable" | "edge" | "experimental" {
  const VALID = ["stable", "edge", "experimental"] as const;

  if (envChannel && (VALID as readonly string[]).includes(envChannel)) {
    return envChannel as "stable" | "edge" | "experimental";
  }

  const dashIdx = version.indexOf("-");
  if (dashIdx !== -1) {
    const prerelease = version.slice(dashIdx + 1).toLowerCase();
    if (prerelease.includes("experimental")) return "experimental";
    if (prerelease.includes("edge")) return "edge";
  }

  return "stable";
}

export const APP_CHANNEL: "stable" | "edge" | "experimental" = deriveChannel(
  APP_VERSION,
  process.env.AETHERA_CHANNEL,
);
