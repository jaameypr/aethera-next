import "server-only";

import type {
  ModuleRegistry,
  RegistryModule,
  ModuleManifest,
  ModuleCatalogEntry,
} from "@/lib/api/types";
import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

let _cache: ModuleRegistry | null = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------------ */
/*  Registry URL                                                       */
/* ------------------------------------------------------------------ */

function getRegistryUrl(): string {
  const raw = process.env.MODULE_REGISTRY_URL;
  if (!raw) throw new Error("MODULE_REGISTRY_URL not configured");

  // Normalise: accept both /shares/{id} and /api/shares/{id}
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.match(/^\/shares\//) && !parsed.pathname.startsWith("/api/")) {
      parsed.pathname = `/api${parsed.pathname}`;
      console.log("[module-registry] Normalized URL: added /api prefix →", parsed.href);
      return parsed.href;
    }
    return raw;
  } catch {
    return raw;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fetch the remote registry (cached for 5 min).
 *
 * The registry JSON is hosted as a Paperview share. The URL points to
 * a share endpoint (e.g. /api/shares/{id}) which returns metadata
 * including version info. We then fetch the current version's content
 * which contains the actual registry JSON as a string.
 */
export async function fetchRegistry(
  forceRefresh = false,
): Promise<ModuleRegistry> {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL) {
    console.log("[module-registry] Returning cached registry");
    return _cache;
  }

  const shareUrl = getRegistryUrl();
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
  let data: ModuleRegistry;
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
