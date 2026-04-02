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

/** Fetch the remote registry (cached for 5 min). */
export async function fetchRegistry(
  forceRefresh = false,
): Promise<ModuleRegistry> {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  const url = getRegistryUrl();
  const res = await fetch(url, { next: { revalidate: 0 } });

  if (!res.ok) {
    throw new Error(`Failed to fetch module registry: ${res.status}`);
  }

  const data: ModuleRegistry = await res.json();

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
  const registry = await fetchRegistry();

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
