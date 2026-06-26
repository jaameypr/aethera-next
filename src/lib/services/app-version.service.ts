/**
 * App update-check service.
 *
 * Fetches the latest available panel version from the Aethera Hub and
 * exposes a cached result. Degrades gracefully — any fetch/parse/network
 * error returns a safe default and never throws.
 */
import "server-only";

import { APP_VERSION, APP_CHANNEL } from "@/lib/version";
import { isNewer } from "@/lib/utils/semver";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  mandatory: boolean;
  changelog: string;
  channel: string;
  imageTag: string | null;
  checkedAt: string;
}

// ── Module-level cache ────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache: { value: UpdateStatus; time: number } | null = null;

// ── Safe default ──────────────────────────────────────────────────────────────

function safeDefault(): UpdateStatus {
  return {
    current: APP_VERSION,
    latest: null,
    updateAvailable: false,
    mandatory: false,
    changelog: "",
    channel: APP_CHANNEL,
    imageTag: null,
    checkedAt: new Date().toISOString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current running version of the panel.
 */
export function getCurrentVersion(): string {
  return APP_VERSION;
}

/**
 * Fetches the update status from the Aethera Hub.
 *
 * Results are cached for 1 hour. Pass `forceRefresh = true` to bypass the
 * cache and immediately re-fetch from the Hub.
 *
 * Never throws — returns a safe default `{ updateAvailable: false }` on any
 * failure.
 */
export async function getUpdateStatus(forceRefresh = false): Promise<UpdateStatus> {
  const now = Date.now();

  // Return cached result if still valid and no force-refresh requested
  if (!forceRefresh && _cache !== null && now - _cache.time < CACHE_TTL_MS) {
    return _cache.value;
  }

  try {
    const hubBase =
      process.env.AETHERA_HUB_URL ?? "https://modules.getaethera.de";
    const url = `${hubBase}/api/version/latest?channel=${APP_CHANNEL}&current=${APP_VERSION}`;

    const res = await fetch(url);

    if (!res.ok) {
      const fallback = safeDefault();
      _cache = { value: fallback, time: now };
      return fallback;
    }

    const data = await res.json();

    // Trust the Hub's updateAvailable if present; otherwise compute it.
    const updateAvailable =
      typeof data.updateAvailable === "boolean"
        ? data.updateAvailable
        : typeof data.latest === "string"
        ? isNewer(data.latest, APP_VERSION)
        : false;

    const result: UpdateStatus = {
      current: APP_VERSION,
      latest: data.latest ?? null,
      updateAvailable,
      mandatory: Boolean(data.mandatory),
      changelog: data.changelog ?? "",
      channel: data.channel ?? APP_CHANNEL,
      imageTag: data.imageTag ?? null,
      checkedAt: new Date().toISOString(),
    };

    _cache = { value: result, time: now };
    return result;
  } catch {
    const fallback = safeDefault();
    _cache = { value: fallback, time: now };
    return fallback;
  }
}
