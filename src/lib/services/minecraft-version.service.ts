import "server-only";

const MANIFEST_URL =
  "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

let _cache: { value: string; fetchedAt: number } | null = null;

/**
 * Returns Mojang's current stable release version (latest.release).
 * In-memory TTL cache (~1h). Throws if the fetch fails and no cache exists.
 */
export async function getLatestRelease(): Promise<string> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL) {
    return _cache.value;
  }

  let res: Response;
  try {
    res = await fetch(MANIFEST_URL, { next: { revalidate: 3600 } });
  } catch (err) {
    if (_cache) return _cache.value;
    throw new Error(
      `Failed to fetch Mojang version manifest: ${err instanceof Error ? err.message : "network error"}`,
    );
  }

  if (!res.ok) {
    if (_cache) return _cache.value;
    throw new Error(`Mojang version manifest request failed (${res.status})`);
  }

  const data = (await res.json()) as { latest?: { release?: string } };
  const release = data.latest?.release;
  if (!release) {
    if (_cache) return _cache.value;
    throw new Error("Mojang version manifest missing latest.release");
  }

  _cache = { value: release, fetchedAt: Date.now() };
  return release;
}

import type { IServer } from "@/lib/db/models/server";

/** True when the server is pinned to the "latest" sentinel. */
export function versionTracksLatest(server: IServer): boolean {
  return server.version === "latest";
}

/**
 * Mojang release strings are exact identifiers — an update is available
 * whenever the running version differs from the latest release.
 */
export function isUpdateAvailable(
  current: string | null | undefined,
  latest: string,
): boolean {
  return current !== latest;
}

/**
 * The concrete version a "latest"-tracking server is currently running on,
 * or the pinned version for fixed servers. null if "latest" is unresolved.
 */
export function resolveEffectiveVersion(server: IServer): string | null {
  if (versionTracksLatest(server)) {
    return server.resolvedMinecraftVersion ?? null;
  }
  return server.version ?? null;
}
