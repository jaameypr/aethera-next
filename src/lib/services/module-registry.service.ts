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
  const url = process.env.MODULE_REGISTRY_URL;
  if (!url) throw new Error("MODULE_REGISTRY_URL not configured");
  return url;
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
    return _cache;
  }

  const shareUrl = getRegistryUrl();

  // Step 1: Fetch share metadata to get the current version ID
  const shareRes = await fetch(shareUrl, { next: { revalidate: 0 } });
  if (!shareRes.ok) {
    throw new Error(`Failed to fetch registry share: ${shareRes.status}`);
  }
  const { share, versions } = await shareRes.json();
  const versionId: string = share?.currentVersionId ?? versions?.[0]?._id;
  if (!versionId) {
    throw new Error("Registry share has no versions");
  }

  // Step 2: Fetch the raw content of the current version
  const contentRes = await fetch(`${shareUrl}/versions/${versionId}/content`, {
    next: { revalidate: 0 },
  });
  if (!contentRes.ok) {
    throw new Error(`Failed to fetch registry content: ${contentRes.status}`);
  }
  const { content } = await contentRes.json();

  if (typeof content !== "string") {
    throw new Error("Registry share content is not a string");
  }

  // Step 3: Parse the inner JSON string into a ModuleRegistry
  let data: ModuleRegistry;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error(
      `Registry content is not valid JSON: ${content.slice(0, 120)}`,
    );
  }

  if (!data.modules || !Array.isArray(data.modules)) {
    throw new Error("Invalid module registry format");
  }

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
  } catch {
    // Registry unreachable — return only installed modules
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
            status: inst.status,
            internalUrl: inst.internalUrl,
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
