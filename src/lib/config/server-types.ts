/**
 * Centralized server-type capability and compatibility config.
 * Add NeoForge, Quilt, additional pack platforms etc. here without
 * touching wizard logic or container helpers.
 */

export type ServerType =
  | "vanilla"
  | "paper"
  | "spigot"
  | "purpur"
  | "forge"
  | "fabric"
  | "curseforge"
  | "modrinth"
  | "hytale";

export type PackSource = "curseforge" | "modrinth";

export interface ServerTypeConfig {
  /** Display label */
  label: string;
  /** Short description shown in wizard */
  description: string;
  /** Underlying Docker runtime preset */
  runtime: "minecraft" | "hytale";
  /**
   * itzg/minecraft-server TYPE env var value.
   * null = not a Minecraft image (e.g. Hytale).
   */
  dockerType: string | null;
  /** Pack-driven install source; undefined for manual types */
  packSource?: PackSource;
  /** Whether version is resolved from the pack (not user-entered) */
  isPack: boolean;
  /** Whether user enters a Minecraft version manually */
  supportsManualVersion: boolean;
  /** True for Forge/Fabric where loader version matters */
  hasLoader: boolean;
  /**
   * For UI grouping: "vanilla-like" = simple server types,
   * "modded" = loader-based, "pack" = pack-driven
   */
  group: "vanilla-like" | "modded" | "pack" | "other";
}

export const SERVER_TYPE_MAP: Record<ServerType, ServerTypeConfig> = {
  vanilla: {
    label: "Vanilla",
    description: "Reiner Vanilla-Server ohne Mods",
    runtime: "minecraft",
    dockerType: "VANILLA",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  paper: {
    label: "Paper",
    description: "Optimierter Bukkit-Fork mit Plugin-Support",
    runtime: "minecraft",
    dockerType: "PAPER",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  spigot: {
    label: "Spigot",
    description: "Bewährter Bukkit-Fork mit Plugin-Support",
    runtime: "minecraft",
    dockerType: "SPIGOT",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  purpur: {
    label: "Purpur",
    description: "Paper-Fork mit erweiterten Konfigurationsoptionen",
    runtime: "minecraft",
    dockerType: "PURPUR",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  forge: {
    label: "Forge",
    description: "Klassischer Mod-Loader für umfangreiche Mods",
    runtime: "minecraft",
    dockerType: "FORGE",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: true,
    group: "modded",
  },
  fabric: {
    label: "Fabric",
    description: "Leichtgewichtiger Mod-Loader, schnelle Updates",
    runtime: "minecraft",
    dockerType: "FABRIC",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: true,
    group: "modded",
  },
  curseforge: {
    label: "CurseForge",
    description: "Modpack von CurseForge installieren",
    runtime: "minecraft",
    dockerType: "AUTO_CURSEFORGE",
    packSource: "curseforge",
    isPack: true,
    supportsManualVersion: false,
    hasLoader: false,
    group: "pack",
  },
  modrinth: {
    label: "Modrinth",
    description: "Modpack von Modrinth (.mrpack) installieren",
    runtime: "minecraft",
    dockerType: "MODRINTH",
    packSource: "modrinth",
    isPack: true,
    supportsManualVersion: false,
    hasLoader: false,
    group: "pack",
  },
  hytale: {
    label: "Hytale",
    description: "Hytale-Server (Early Access)",
    runtime: "hytale",
    dockerType: null,
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "other",
  },
};

/** Ordered list for display in wizard type-selection grid */
export const SERVER_TYPE_ORDER: ServerType[] = [
  "vanilla",
  "paper",
  "spigot",
  "purpur",
  "forge",
  "fabric",
  "curseforge",
  "modrinth",
  "hytale",
];

/** Helper: derive Docker TYPE string from a serverType, falling back to modLoader */
export function getDockerType(
  serverType?: ServerType | null,
  modLoader?: string | null,
): string {
  if (serverType && SERVER_TYPE_MAP[serverType]?.dockerType) {
    return SERVER_TYPE_MAP[serverType].dockerType!;
  }
  if (modLoader) return modLoader.toUpperCase();
  return "VANILLA";
}

/** Helper: derive runtime from serverType */
export function getRuntimeFromType(serverType: ServerType): "minecraft" | "hytale" {
  return SERVER_TYPE_MAP[serverType]?.runtime ?? "minecraft";
}
