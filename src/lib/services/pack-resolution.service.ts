import "server-only";

import type { IPackReference } from "@/lib/db/models/server";

export interface ResolvedPackInfo {
  packName: string;
  packDescription?: string;
  mcVersion: string;
  loader: string;
  loaderVersion?: string;
  iconUrl?: string;
}

// ---------------------------------------------------------------------------
// Modrinth
// ---------------------------------------------------------------------------

const MODRINTH_API = "https://api.modrinth.com/v2";

/**
 * Resolve a Modrinth modpack.
 * ref.projectId can be a slug (e.g. "fabulously-optimized") or ID.
 * ref.versionId targets a specific version; omit for latest.
 */
export async function resolveModrinthPack(
  ref: IPackReference,
): Promise<ResolvedPackInfo> {
  const projectId = ref.projectId || ref.slug;
  if (!projectId) throw new Error("Modrinth: projectId oder Slug erforderlich");

  // Fetch project metadata
  const projectRes = await fetch(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`, {
    headers: { "User-Agent": "aethera-panel/1.0" },
    next: { revalidate: 60 },
  });
  if (!projectRes.ok) {
    if (projectRes.status === 404) throw new Error(`Modrinth-Projekt nicht gefunden: ${projectId}`);
    throw new Error(`Modrinth API Fehler: ${projectRes.status}`);
  }
  const project = await projectRes.json() as {
    title: string;
    description?: string;
    icon_url?: string;
    project_type?: string;
  };

  if (project.project_type !== "modpack") {
    throw new Error(`"${project.title}" ist kein Modpack (Typ: ${project.project_type})`);
  }

  // Fetch version — specific or latest
  let version: {
    version_number: string;
    game_versions: string[];
    loaders: string[];
    dependencies?: { version_id?: string; dependency_type: string; project_id?: string }[];
  };

  if (ref.versionId) {
    const vRes = await fetch(`${MODRINTH_API}/version/${encodeURIComponent(ref.versionId)}`, {
      headers: { "User-Agent": "aethera-panel/1.0" },
      next: { revalidate: 60 },
    });
    if (!vRes.ok) throw new Error(`Modrinth-Version nicht gefunden: ${ref.versionId}`);
    version = await vRes.json();
  } else {
    // Get latest game version for the project
    const versionsRes = await fetch(
      `${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version`,
      { headers: { "User-Agent": "aethera-panel/1.0" }, next: { revalidate: 60 } },
    );
    if (!versionsRes.ok) throw new Error("Modrinth-Versionen konnten nicht abgerufen werden");
    const versions = await versionsRes.json() as typeof version[];
    if (!versions.length) throw new Error("Keine Versionen für dieses Modrinth-Projekt gefunden");
    version = versions[0];
  }

  const mcVersion = version.game_versions?.[0];
  if (!mcVersion) throw new Error("Minecraft-Version konnte nicht aus Modrinth-Pack ermittelt werden");

  const loaderRaw = version.loaders?.find((l) => l !== "minecraft") ?? version.loaders?.[0];
  const loader = loaderRaw ?? "fabric";

  return {
    packName: project.title,
    packDescription: project.description,
    mcVersion,
    loader,
    iconUrl: project.icon_url,
  };
}

/**
 * Parse a .mrpack ZIP buffer and extract pack metadata from modrinth.index.json.
 */
export async function parseMrpack(buffer: Buffer): Promise<ResolvedPackInfo> {
  // Dynamically import yauzl (already in serverExternalPackages)
  const yauzl = await import("yauzl");

  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(new Error("Ungültige .mrpack-Datei"));
      zip.readEntry();
      zip.on("entry", (entry) => {
        if (entry.fileName === "modrinth.index.json") {
          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr) return reject(streamErr);
            const chunks: Buffer[] = [];
            stream.on("data", (c: Buffer) => chunks.push(c));
            stream.on("end", () => {
              try {
                const index = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
                  name: string;
                  summary?: string;
                  versionId?: string;
                  dependencies?: Record<string, string>;
                };
                const deps = index.dependencies ?? {};
                const mcVersion = deps.minecraft;
                if (!mcVersion) return reject(new Error("modrinth.index.json enthält keine Minecraft-Version"));

                const loaderEntry = Object.entries(deps).find(([k]) => k !== "minecraft");
                const loader = loaderEntry ? loaderEntry[0].replace("-loader", "") : "fabric";
                const loaderVersion = loaderEntry?.[1];

                resolve({
                  packName: index.name ?? "Unbekanntes Pack",
                  packDescription: index.summary,
                  mcVersion,
                  loader,
                  loaderVersion,
                });
              } catch {
                reject(new Error("modrinth.index.json konnte nicht geparst werden"));
              }
            });
            stream.on("error", reject);
          });
        } else {
          zip.readEntry();
        }
      });
      zip.on("end", () => reject(new Error("modrinth.index.json nicht im .mrpack gefunden")));
      zip.on("error", reject);
    });
  });
}

// ---------------------------------------------------------------------------
// CurseForge
// ---------------------------------------------------------------------------

const CF_API = "https://api.curseforge.com/v1";

function getCfApiKey(): string {
  const key = process.env.CURSEFORGE_API_KEY;
  if (!key) throw new Error("CURSEFORGE_API_KEY ist nicht konfiguriert");
  return key;
}

interface CfModFile {
  id: number;
  displayName: string;
  gameVersions: string[];
  modules?: { name: string; fingerprint: number }[];
}

interface CfMod {
  id: number;
  name: string;
  summary?: string;
  logo?: { url: string };
  classId?: number; // 4471 = modpacks
  latestFiles?: CfModFile[];
}

/**
 * Resolve a CurseForge modpack.
 * ref.projectId = numeric CurseForge project ID
 * ref.slug = project slug (resolves via search)
 * ref.fileId = specific file ID (optional)
 */
export async function resolveCurseForgePack(
  ref: IPackReference,
): Promise<ResolvedPackInfo> {
  const apiKey = getCfApiKey();
  const headers = { "x-api-key": apiKey, Accept: "application/json" };

  let mod: CfMod;

  if (ref.projectId) {
    const res = await fetch(`${CF_API}/mods/${encodeURIComponent(ref.projectId)}`, { headers });
    if (!res.ok) {
      if (res.status === 404) throw new Error(`CurseForge-Projekt nicht gefunden: ${ref.projectId}`);
      throw new Error(`CurseForge API Fehler: ${res.status}`);
    }
    const body = await res.json() as { data: CfMod };
    mod = body.data;
  } else if (ref.slug) {
    // Search by slug
    const res = await fetch(
      `${CF_API}/mods/search?gameId=432&slug=${encodeURIComponent(ref.slug)}&classId=4471`,
      { headers },
    );
    if (!res.ok) throw new Error(`CurseForge-Suche fehlgeschlagen: ${res.status}`);
    const body = await res.json() as { data: CfMod[] };
    if (!body.data.length) throw new Error(`CurseForge-Modpack nicht gefunden: ${ref.slug}`);
    mod = body.data[0];
  } else {
    throw new Error("CurseForge: projectId oder Slug erforderlich");
  }

  if (mod.classId !== 4471) {
    throw new Error(`"${mod.name}" ist kein Modpack`);
  }

  // Find the target file
  let file: CfModFile | undefined;
  if (ref.fileId) {
    const fileRes = await fetch(`${CF_API}/mods/${mod.id}/files/${encodeURIComponent(ref.fileId)}`, { headers });
    if (!fileRes.ok) throw new Error(`CurseForge-Datei nicht gefunden: ${ref.fileId}`);
    const fileBody = await fileRes.json() as { data: CfModFile };
    file = fileBody.data;
  } else {
    file = mod.latestFiles?.[0];
  }

  if (!file) throw new Error("Keine Dateien für dieses CurseForge-Modpack gefunden");

  // Parse MC version and loader from gameVersions (e.g. ["1.20.1", "Forge"])
  const mcVersion = file.gameVersions.find((v) => /^\d+\.\d+/.test(v));
  const loaderRaw = file.gameVersions.find((v) => /^(Forge|Fabric|NeoForge|Quilt)$/i.test(v));
  const loader = loaderRaw?.toLowerCase() ?? "forge";

  if (!mcVersion) throw new Error("Minecraft-Version konnte nicht aus CurseForge-Pack ermittelt werden");

  return {
    packName: mod.name,
    packDescription: mod.summary,
    mcVersion,
    loader,
    iconUrl: mod.logo?.url,
  };
}
