import crypto from "node:crypto";

/**
 * Mojang profile lookup + offline-mode UUID derivation.
 *
 * Mojang returns an undashed 32-char hex `id`; Minecraft's whitelist.json /
 * ops.json store the canonical dashed (8-4-4-4-12) form, so we convert.
 */

export interface MojangProfile {
  uuid: string;
  name: string;
}

const MOJANG_PROFILE_URL =
  "https://api.mojang.com/users/profiles/minecraft/";

const CACHE_TTL_MS = 10 * 60 * 1000; // ~10 min
const cache = new Map<string, { profile: MojangProfile | null; at: number }>();

/** Convert a 32-char undashed hex UUID into the canonical dashed form. */
export function dashifyUuid(hex32: string): string {
  const h = hex32.replace(/-/g, "").toLowerCase();
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-" +
    h.slice(12, 16) +
    "-" +
    h.slice(16, 20) +
    "-" +
    h.slice(20, 32)
  );
}

/**
 * Compute the deterministic offline-mode UUID for a username, matching Java's
 * `UUID.nameUUIDFromBytes(("OfflinePlayer:"+name).getBytes(UTF_8))` — a v3
 * (MD5) UUID. Used so offline-mode servers get a stable uuid when Mojang
 * cannot resolve the name.
 */
export function offlineUuid(name: string): string {
  const hash = crypto
    .createHash("md5")
    .update("OfflinePlayer:" + name, "utf8")
    .digest();

  // Set the version (3) and IETF variant bits, per RFC 4122 / Java's impl.
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  return dashifyUuid(hash.toString("hex"));
}

/**
 * Resolve a Minecraft username to its Mojang profile.
 * - 200 → `{ uuid, name }` (dashed uuid + canonical name)
 * - 204 / 404 → null (no such player)
 * - network error → throws a clear error
 */
export async function resolveProfile(
  name: string,
): Promise<MojangProfile | null> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.profile;
  }

  let res: Response;
  try {
    res = await fetch(MOJANG_PROFILE_URL + encodeURIComponent(name), {
      headers: { "User-Agent": "aethera" },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new Error(
      `Failed to reach Mojang profile API for "${name}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (res.status === 204 || res.status === 404) {
    cache.set(key, { profile: null, at: Date.now() });
    return null;
  }

  if (res.status !== 200) {
    throw new Error(
      `Mojang profile API returned status ${res.status} for "${name}"`,
    );
  }

  const json = (await res.json()) as { id: string; name: string };
  const profile: MojangProfile = {
    uuid: dashifyUuid(json.id),
    name: json.name,
  };
  cache.set(key, { profile, at: Date.now() });
  return profile;
}
