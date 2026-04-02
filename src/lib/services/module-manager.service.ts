import "server-only";

import crypto from "node:crypto";
import { connectDB } from "@/lib/db/connection";
import {
  InstalledModuleModel,
  type IInstalledModule,
} from "@/lib/db/models/installed-module";
import {
  getOrchestrator,
  getDockerClient,
} from "@/lib/docker/orchestrator";
import {
  startContainer,
  stopContainer,
  removeContainer,
  inspectContainer,
} from "@pruefertit/docker-orchestrator";
import {
  getRegistryModule,
  fetchManifest,
} from "@/lib/services/module-registry.service";
import { provisionApiKey } from "@/lib/services/module-auth.service";
import type { ModuleManifest, InstalledModuleResponse } from "@/lib/api/types";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CONTAINER_PREFIX = "aethera-mod-";
const NETWORK = "aethera-net";
const LABEL_PREFIX = "aethera.module";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function moduleContainerName(moduleId: string): string {
  return `${CONTAINER_PREFIX}${moduleId}`;
}

function buildMongoUri(dbName: string): string {
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) throw new Error("MONGODB_URI not configured");

  // Replace the database name in the URI
  // mongodb://user:pass@host:port/aethera?authSource=admin
  // → mongodb://user:pass@host:port/{dbName}?authSource=admin
  return baseUri.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
}

function toResponse(doc: IInstalledModule): InstalledModuleResponse {
  return {
    _id: doc._id.toString(),
    moduleId: doc.moduleId,
    name: doc.name,
    version: doc.version,
    type: doc.type,
    status: doc.status,
    internalUrl: doc.internalUrl,
    assignedPort: doc.assignedPort,
    errorMessage: doc.errorMessage,
    sidebar: doc.sidebar,
    permissions: doc.permissions,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function listInstalledModules(): Promise<
  InstalledModuleResponse[]
> {
  await connectDB();
  const docs = await InstalledModuleModel.find().sort({ name: 1 }).lean();
  return docs.map(toResponse);
}

export async function getInstalledModule(
  moduleId: string,
): Promise<InstalledModuleResponse | null> {
  await connectDB();
  const doc = await InstalledModuleModel.findOne({ moduleId }).lean();
  return doc ? toResponse(doc) : null;
}

/**
 * Return sidebar items from all running modules.
 * Used by the layout to build dynamic navigation.
 */
export async function getModuleSidebarItems(): Promise<
  Array<{
    moduleId: string;
    label: string;
    icon: string;
    description?: string;
    type: "docker" | "code";
  }>
> {
  await connectDB();
  const modules = await InstalledModuleModel.find({
    status: "running",
  }).lean();

  return modules.flatMap((mod) =>
    mod.sidebar.map((item) => ({
      moduleId: mod.moduleId,
      label: item.label,
      icon: item.icon,
      description: item.description,
      type: mod.type,
    })),
  );
}

/* ------------------------------------------------------------------ */
/*  Install                                                            */
/* ------------------------------------------------------------------ */

export async function installModule(
  moduleId: string,
  version: string,
  userId: string,
  userConfig?: Record<string, string>,
): Promise<InstalledModuleResponse> {
  await connectDB();

  // Check if already installed
  const existing = await InstalledModuleModel.findOne({ moduleId });
  if (existing) throw new Error(`Module "${moduleId}" is already installed`);

  // Fetch registry entry & manifest
  const registryEntry = await getRegistryModule(moduleId);
  if (!registryEntry) throw new Error(`Module "${moduleId}" not found in registry`);

  const versionEntry = registryEntry.versions.find(
    (v) => v.version === version,
  );
  if (!versionEntry) {
    throw new Error(
      `Version "${version}" not found for module "${moduleId}"`,
    );
  }

  const manifest = await fetchManifest(versionEntry.manifestUrl);

  // Create DB record (status: installing)
  const doc = await InstalledModuleModel.create({
    moduleId: manifest.id,
    name: manifest.name,
    version: manifest.version,
    type: manifest.type,
    status: "installing",
    manifest: JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>,
    config: buildEnvConfig(manifest, userConfig),
    sidebar: manifest.sidebar?.items ?? [],
    permissions: (manifest.permissions ?? []).map((p) => p.name),
    installedBy: userId,
  });

  try {
    if (manifest.type === "docker") {
      await deployDockerModule(doc as IInstalledModule, manifest);
    }

    doc.status = "running";
    await doc.save();

    // Auto-provision API key if the module supports it
    if (manifest.auth?.strategy === "api_key") {
      scheduleApiKeyProvisioning(manifest.id);
    }
  } catch (err) {
    doc.status = "error";
    doc.errorMessage = err instanceof Error ? err.message : "Install failed";
    await doc.save();
    throw err;
  }

  return toResponse(doc as IInstalledModule);
}

/* ------------------------------------------------------------------ */
/*  Uninstall                                                          */
/* ------------------------------------------------------------------ */

export async function uninstallModule(moduleId: string): Promise<void> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId });
  if (!doc) throw new Error(`Module "${moduleId}" is not installed`);

  doc.status = "uninstalling";
  await doc.save();

  try {
    if (doc.type === "docker" && doc.containerId) {
      const docker = await getDockerClient();
      try {
        await stopContainer(docker, doc.containerId, 30);
      } catch {
        // Container may already be stopped
      }
      await removeContainer(docker, doc.containerId);
    }
  } catch (err) {
    console.error(`Error removing container for ${moduleId}:`, err);
  }

  await InstalledModuleModel.deleteOne({ moduleId });
}

/* ------------------------------------------------------------------ */
/*  Start / Stop                                                       */
/* ------------------------------------------------------------------ */

export async function startModule(
  moduleId: string,
): Promise<InstalledModuleResponse> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId });
  if (!doc) throw new Error(`Module "${moduleId}" is not installed`);
  if (doc.status === "running") throw new Error("Module is already running");

  if (doc.type === "docker") {
    if (!doc.containerId) {
      // Re-deploy if container was removed
      const manifest = doc.manifest as unknown as ModuleManifest;
      await deployDockerModule(doc, manifest);
    } else {
      const docker = await getDockerClient();
      await startContainer(docker, doc.containerId);
    }
  }

  doc.status = "running";
  doc.errorMessage = undefined;
  await doc.save();

  return toResponse(doc);
}

export async function stopModule(
  moduleId: string,
): Promise<InstalledModuleResponse> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId });
  if (!doc) throw new Error(`Module "${moduleId}" is not installed`);
  if (doc.status === "stopped") throw new Error("Module is already stopped");

  if (doc.type === "docker" && doc.containerId) {
    const docker = await getDockerClient();
    await stopContainer(docker, doc.containerId, 30);
  }

  doc.status = "stopped";
  await doc.save();

  return toResponse(doc);
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

export async function updateModule(
  moduleId: string,
  targetVersion: string,
): Promise<InstalledModuleResponse> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId });
  if (!doc) throw new Error(`Module "${moduleId}" is not installed`);

  const registryEntry = await getRegistryModule(moduleId);
  if (!registryEntry) throw new Error(`Module "${moduleId}" not found in registry`);

  const versionEntry = registryEntry.versions.find(
    (v) => v.version === targetVersion,
  );
  if (!versionEntry) {
    throw new Error(`Version "${targetVersion}" not found`);
  }

  const manifest = await fetchManifest(versionEntry.manifestUrl);

  doc.status = "updating";
  await doc.save();

  try {
    // Stop & remove old container
    if (doc.type === "docker" && doc.containerId) {
      const docker = await getDockerClient();
      try {
        await stopContainer(docker, doc.containerId, 30);
      } catch {
        /* already stopped */
      }
      await removeContainer(docker, doc.containerId);
      doc.containerId = undefined;
    }

    // Deploy new version
    doc.version = manifest.version;
    doc.manifest = manifest as unknown as Record<string, unknown>;
    doc.sidebar = manifest.sidebar?.items ?? [];
    doc.permissions = (manifest.permissions ?? []).map((p) => p.name);

    if (manifest.type === "docker") {
      await deployDockerModule(doc, manifest);
    }

    doc.status = "running";
    doc.errorMessage = undefined;
    await doc.save();
  } catch (err) {
    doc.status = "error";
    doc.errorMessage = err instanceof Error ? err.message : "Update failed";
    await doc.save();
    throw err;
  }

  return toResponse(doc);
}

/* ------------------------------------------------------------------ */
/*  Update config                                                      */
/* ------------------------------------------------------------------ */

export async function updateModuleConfig(
  moduleId: string,
  config: Record<string, string>,
): Promise<InstalledModuleResponse> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId });
  if (!doc) throw new Error(`Module "${moduleId}" is not installed`);

  const manifest = doc.manifest as unknown as ModuleManifest;
  const configurableKeys = new Set(
    (manifest.env?.configurable ?? []).map((e) => e.key),
  );

  // Only allow updating keys defined as configurable
  for (const [key, value] of Object.entries(config)) {
    if (!configurableKeys.has(key)) continue;

    const idx = doc.config.findIndex((c) => c.key === key);
    const def = manifest.env?.configurable?.find((e) => e.key === key);
    const secret = def?.secret ?? false;

    if (idx >= 0) {
      doc.config[idx].value = value;
    } else {
      doc.config.push({ key, value, secret });
    }
  }

  await doc.save();

  return toResponse(doc);
}

/* ------------------------------------------------------------------ */
/*  Health check                                                       */
/* ------------------------------------------------------------------ */

export async function checkModuleHealth(
  moduleId: string,
): Promise<{ healthy: boolean; status: string }> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId }).lean();
  if (!doc) return { healthy: false, status: "not_installed" };
  if (doc.type !== "docker" || !doc.internalUrl) {
    return { healthy: doc.status === "running", status: doc.status };
  }

  const manifest = doc.manifest as unknown as ModuleManifest;
  const healthPath = manifest.docker?.healthCheck ?? "/api/health";

  try {
    const res = await fetch(`${doc.internalUrl}${healthPath}`, {
      signal: AbortSignal.timeout(5000),
    });
    return { healthy: res.ok, status: res.ok ? "healthy" : `http_${res.status}` };
  } catch {
    return { healthy: false, status: "unreachable" };
  }
}

/* ------------------------------------------------------------------ */
/*  Internal: Delayed API key provisioning                             */
/* ------------------------------------------------------------------ */

/**
 * The module container needs time to boot before we can call its API.
 * We retry a few times with increasing delay.
 */
function scheduleApiKeyProvisioning(moduleId: string): void {
  const maxRetries = 10;
  const baseDelay = 5_000; // 5s

  let attempt = 0;

  const tryProvision = async () => {
    attempt++;
    try {
      await provisionApiKey(moduleId);
      console.log(`[modules] API key provisioned for ${moduleId}`);
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        console.log(
          `[modules] API key provisioning for ${moduleId} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay / 1000}s`,
        );
        setTimeout(tryProvision, delay);
      } else {
        console.error(
          `[modules] API key provisioning for ${moduleId} failed after ${maxRetries} attempts:`,
          err,
        );
      }
    }
  };

  // First attempt after 10s (give container time to start)
  setTimeout(tryProvision, 10_000);
}

/* ------------------------------------------------------------------ */
/*  Internal: Docker deployment                                        */
/* ------------------------------------------------------------------ */

async function deployDockerModule(
  doc: IInstalledModule,
  manifest: ModuleManifest,
): Promise<void> {
  if (!manifest.docker) {
    throw new Error("Docker config missing in manifest");
  }

  const containerNameStr = moduleContainerName(manifest.id);
  const port = manifest.docker.port;

  // Build environment variables
  const env = buildContainerEnv(manifest, doc);

  // Build volume mounts
  const volumes = Object.entries(manifest.docker.volumes ?? {}).map(
    ([name, target]) => ({
      name: `aethera-mod-${manifest.id}-${name}`,
      target,
    }),
  );

  const orch = await getOrchestrator();

  const result = await orch.deploy({
    name: containerNameStr,
    image: manifest.docker.image,
    tag: "latest",
    env,
    ports: [], // No host port binding — accessed internally via Docker network
    mounts: volumes.map((v) => ({
      type: "volume" as const,
      source: v.name,
      target: v.target,
      readOnly: false,
    })),
    labels: {
      [`${LABEL_PREFIX}.id`]: manifest.id,
      [`${LABEL_PREFIX}.version`]: manifest.version,
      [`${LABEL_PREFIX}.type`]: manifest.type,
      "aethera.type": "module",
    },
    restartPolicy: "unless-stopped",
    resources: manifest.docker.resources
      ? {
          memory: manifest.docker.resources.memoryLimit
            ? { limit: manifest.docker.resources.memoryLimit }
            : undefined,
          cpu: manifest.docker.resources.cpuLimit
            ? { nanoCpus: manifest.docker.resources.cpuLimit }
            : undefined,
        }
      : undefined,
    stopTimeout: 30,
  });

  doc.containerId = result.containerId;
  doc.containerName = containerNameStr;
  doc.internalUrl = `http://${containerNameStr}:${port}`;
}

/* ------------------------------------------------------------------ */
/*  Internal: Environment variable building                            */
/* ------------------------------------------------------------------ */

function buildContainerEnv(
  manifest: ModuleManifest,
  doc: IInstalledModule,
): Record<string, string> {
  const env: Record<string, string> = {
    NODE_ENV: "production",
  };

  // Auto env vars
  const autoKeys = new Set(manifest.env?.auto ?? []);

  if (autoKeys.has("MONGODB_URI") && manifest.database?.name) {
    env.MONGODB_URI = buildMongoUri(manifest.database.name);
  }

  if (autoKeys.has("AUTH_SECRET")) {
    // Generate a stable secret per module (derived from JWT_SECRET + moduleId)
    const base = process.env.JWT_SECRET || "fallback";
    env.AUTH_SECRET = crypto
      .createHmac("sha256", base)
      .update(`module:${manifest.id}`)
      .digest("hex");
  }

  // User-configured env vars
  for (const entry of doc.config) {
    env[entry.key] = entry.value;
  }

  return env;
}

function buildEnvConfig(
  manifest: ModuleManifest,
  userConfig?: Record<string, string>,
): Array<{ key: string; value: string; secret: boolean }> {
  const configurable = manifest.env?.configurable ?? [];
  const result: Array<{ key: string; value: string; secret: boolean }> = [];

  for (const def of configurable) {
    const value = userConfig?.[def.key] ?? def.default ?? "";
    result.push({
      key: def.key,
      value,
      secret: def.secret ?? false,
    });
  }

  return result;
}
