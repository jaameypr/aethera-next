import "server-only";

import type {
  ModuleRegistry,
  RegistryModule,
  ModuleManifest,
  ModuleCatalogEntry,
} from "@/lib/api/types";
import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import { APP_VERSION } from "@/lib/version";
import { isValid, withinRange, compareDesc } from "@/lib/utils/semver";

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

let _cache: ModuleRegistry | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------------ */
/*  Registry URL helpers                                               */
/* ------------------------------------------------------------------ */

/**
 * Returns true when the URL targets a legacy Paperview share endpoint.
 * These contain "/shares/" in their path.
 */
export function isLegacyShareUrl(url: string): boolean {
  try {
    return new URL(url).pathname.includes("/shares/");
  } catch {
    return url.includes("/shares/");
  }
}

function getRegistryUrl(): string {
  const raw = process.env.MODULE_REGISTRY_URL;
  if (!raw) throw new Error("MODULE_REGISTRY_URL not configured");

  if (isLegacyShareUrl(raw)) {
    // Normalise: accept both /shares/{id} and /api/shares/{id}
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.match(/^\/shares\//) && !parsed.pathname.startsWith("/api/")) {
        parsed.pathname = `/api${parsed.pathname}`;
        console.log("[module-registry] Normalized URL: added /api prefix →", parsed.href);
        return parsed.href;
      }
    } catch {
      // fall through and return raw
    }
  }

  return raw;
}

/* ------------------------------------------------------------------ */
/*  Version gating                                                     */
/* ------------------------------------------------------------------ */

/**
 * Filter each module's versions to those compatible with the running
 * panel version (APP_VERSION), then drop modules with zero remaining
 * versions.
 *
 * A version is compatible when:
 *  - minAetheraVersion is a valid semver string, AND
 *  - withinRange(APP_VERSION, minAetheraVersion, maxAetheraVersion?) is true.
 *
 * If minAetheraVersion is missing or invalid, the version is excluded.
 * Per-version errors are swallowed so a bad entry never breaks the whole registry.
 *
 * Surviving versions are sorted newest-first (semver-descending) so the panel
 * is self-consistent regardless of source ordering. The Hub already returns
 * newest-first, but a legacy/dumb registry may not — and `getModuleCatalog`
 * trusts `versions[0]` as the latest version for the "update available" badge.
 */
function gateRegistry(data: ModuleRegistry): ModuleRegistry {
  const gatedModules = data.modules
    .map((mod) => {
      const compatibleVersions = mod.versions.filter((v) => {
        try {
          if (!v.minAetheraVersion || !isValid(v.minAetheraVersion)) return false;
          if (v.maxAetheraVersion && !isValid(v.maxAetheraVersion)) return false;
          return withinRange(APP_VERSION, v.minAetheraVersion, v.maxAetheraVersion);
        } catch {
          return false;
        }
      });

      // Newest-first. Guard against an invalid `version` string (rcompare
      // throws on bad semver): sort valid versions ahead of invalid ones, and
      // leave invalid pairs in their original relative order.
      compatibleVersions.sort((a, b) => {
        const aValid = isValid(a.version);
        const bValid = isValid(b.version);
        if (aValid && bValid) return compareDesc(a.version, b.version);
        if (aValid) return -1;
        if (bValid) return 1;
        return 0;
      });

      return { ...mod, versions: compatibleVersions };
    })
    .filter((mod) => mod.versions.length > 0);

  return { ...data, modules: gatedModules };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch the remote registry (cached for 5 min).
 *
 * Hub mode (default): MODULE_REGISTRY_URL is the Hub base URL
 * (e.g. https://modules.getaethera.de/api/registry). The panel appends
 * /{APP_VERSION} and receives a pre-gated ModuleRegistry in one hop.
 *
 * Legacy mode: MODULE_REGISTRY_URL contains "/shares/" → Paperview
 * 3-hop fetch (share metadata → currentVersionId → version content → JSON.parse).
 *
 * After obtaining the registry in either mode, version gating is applied
 * locally via gateRegistry() to ensure only compatible versions are shown.
 */
export async function fetchRegistry(
  forceRefresh = false,
): Promise<ModuleRegistry> {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL) {
    console.log("[module-registry] Returning cached registry");
    return _cache;
  }

  const registryUrl = getRegistryUrl();
  let data: ModuleRegistry;

  if (isLegacyShareUrl(registryUrl)) {
    // ----------------------------------------------------------------
    // Legacy path: 3-hop Paperview share fetch (unchanged)
    // ----------------------------------------------------------------
    const shareUrl = registryUrl;
    console.log("[module-registry] Fetching share metadata from:", shareUrl);

    // Step 1: Fetch share metadata to get the current version ID
    const shareRes = await fetch(shareUrl, { next: { revalidate: 0 } });
    console.log("[module-registry] Share response status:", shareRes.status);
    if (!shareRes.ok) {
      const body = await shareRes.text();
      console.error("[module-registry] Share fetch failed:", shareRes.status, body.slice(0, 300));
      throw new Error(`Failed to fetch registry share: ${shareRes.status}`);
    }

    const shareJson = await shareRes.json();
    console.log("[module-registry] Share response keys:", Object.keys(shareJson));
    const { share, versions } = shareJson;
    console.log("[module-registry] share.currentVersionId:", share?.currentVersionId, "| versions count:", versions?.length);

    const versionId: string = share?.currentVersionId ?? versions?.[0]?._id;
    if (!versionId) {
      console.error("[module-registry] No versionId found. Full response:", JSON.stringify(shareJson).slice(0, 500));
      throw new Error("Registry share has no versions");
    }

    // Step 2: Fetch the raw content of the current version
    const contentUrl = `${shareUrl}/versions/${versionId}/content`;
    console.log("[module-registry] Fetching version content from:", contentUrl);

    const contentRes = await fetch(contentUrl, { next: { revalidate: 0 } });
    console.log("[module-registry] Content response status:", contentRes.status);
    if (!contentRes.ok) {
      const body = await contentRes.text();
      console.error("[module-registry] Content fetch failed:", contentRes.status, body.slice(0, 300));
      throw new Error(`Failed to fetch registry content: ${contentRes.status}`);
    }

    const contentJson = await contentRes.json();
    console.log("[module-registry] Content response keys:", Object.keys(contentJson));
    const { content } = contentJson;

    if (typeof content !== "string") {
      console.error("[module-registry] Content is not a string, type:", typeof content, "value:", JSON.stringify(contentJson).slice(0, 300));
      throw new Error("Registry share content is not a string");
    }
    console.log("[module-registry] Content length:", content.length, "| preview:", content.slice(0, 100));

    // Step 3: Parse the inner JSON string into a ModuleRegistry
    try {
      data = JSON.parse(content);
    } catch (err) {
      console.error("[module-registry] JSON parse failed:", err, "| content:", content.slice(0, 200));
      throw new Error(
        `Registry content is not valid JSON: ${content.slice(0, 120)}`,
      );
    }

    if (!data.modules || !Array.isArray(data.modules)) {
      console.error("[module-registry] Invalid format, keys:", Object.keys(data));
      throw new Error("Invalid module registry format");
    }
  } else {
    // ----------------------------------------------------------------
    // Hub mode: single GET to versioned endpoint
    // ----------------------------------------------------------------
    const base = registryUrl.replace(/\/$/, "");
    const hubUrl = `${base}/${APP_VERSION}`;
    console.log("[module-registry] Fetching hub registry from:", hubUrl);

    const hubRes = await fetch(hubUrl, { next: { revalidate: 0 } });
    console.log("[module-registry] Hub response status:", hubRes.status);
    if (!hubRes.ok) {
      const body = await hubRes.text();
      console.error("[module-registry] Hub fetch failed:", hubRes.status, body.slice(0, 300));
      throw new Error(`Failed to fetch hub registry: ${hubRes.status}`);
    }

    data = await hubRes.json() as ModuleRegistry;

    if (!data.modules || !Array.isArray(data.modules)) {
      console.error("[module-registry] Hub response invalid format, keys:", Object.keys(data as object));
      throw new Error("Invalid module registry format from hub");
    }
  }

  // Apply local version gating in both modes
  data = gateRegistry(data);

  console.log("[module-registry] Successfully loaded", data.modules.length, "modules from registry");
  _cache = data;
  _cacheTime = Date.now();
  return data;
}

/** Look up a single module by id from the registry. */
export async function getRegistryModule(
  moduleId: string,
): Promise<RegistryModule | null> {
  const registry = await fetchRegistry();
  return registry.modules.find((m) => m.id === moduleId) ?? null;
}

/** Fetch the manifest JSON from a remote URL. */
export async function fetchManifest(
  manifestUrl: string,
): Promise<ModuleManifest> {
  const res = await fetch(manifestUrl, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`Failed to fetch module manifest: ${res.status}`);
  }
  return res.json();
}

/**
 * Build a combined catalog: each registry entry merged with its
 * local install status and whether an update is available.
 */
export async function getModuleCatalog(): Promise<ModuleCatalogEntry[]> {
  let registry: ModuleRegistry;
  try {
    registry = await fetchRegistry();
  } catch (err) {
    console.error("[module-registry] Failed to fetch registry, falling back to empty catalog:", err instanceof Error ? err.message : err);
    registry = { version: 1, updatedAt: "", modules: [] };
  }

  await connectDB();
  const installed = await InstalledModuleModel.find().lean();
  const installedMap = new Map(installed.map((m) => [m.moduleId, m]));

  return registry.modules.map((reg) => {
    const inst = installedMap.get(reg.id);
    const latestVersion = reg.versions[0]?.version ?? null;
    const updateAvailable =
      inst && latestVersion && inst.version !== latestVersion
        ? latestVersion
        : null;

    return {
      registry: reg,
      installed: inst
        ? {
            _id: inst._id.toString(),
            moduleId: inst.moduleId,
            name: inst.name,
            version: inst.version,
            type: inst.type,
            exposure: (inst.exposure as "public" | "internal" | "none") ?? "none",
            status: inst.status,
            manifest: inst.manifest as unknown as import("@/lib/api/types").ModuleManifest,
            savedConfig: Object.fromEntries(
              (inst.config ?? []).map((c) => [c.key, c.secret ? (c.value ? "__SECRET_SET__" : "") : c.value]),
            ),
            internalUrl: inst.internalUrl,
            publicUrl: inst.publicUrl,
            assignedPort: inst.assignedPort,
            errorMessage: inst.errorMessage,
            sidebar: inst.sidebar,
            permissions: inst.permissions,
            createdAt: inst.createdAt.toISOString(),
            updatedAt: inst.updatedAt.toISOString(),
          }
        : null,
      updateAvailable,
    };
  });
}

/** Check for updates across all installed modules. */
export async function checkForUpdates(): Promise<
  Array<{ moduleId: string; currentVersion: string; latestVersion: string }>
> {
  const catalog = await getModuleCatalog();
  return catalog
    .filter((e) => e.updateAvailable !== null)
    .map((e) => ({
      moduleId: e.registry.id,
      currentVersion: e.installed!.version,
      latestVersion: e.updateAvailable!,
    }));
}
