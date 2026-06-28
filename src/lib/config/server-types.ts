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
  | "neoforge"
  | "quilt"
  | "curseforge"
  | "modrinth";

export type PackSource = "curseforge" | "modrinth";

export interface ServerTypeConfig {
  /** Display label */
  label: string;
  /** Short description shown in wizard */
  description: string;
  /**
   * itzg/minecraft-server TYPE env var value.
   */
  dockerType: string;
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
  group: "vanilla-like" | "modded" | "pack";
}

export const SERVER_TYPE_MAP: Record<ServerType, ServerTypeConfig> = {
  vanilla: {
    label: "Vanilla",
    description: "Pure vanilla server without mods",
    dockerType: "VANILLA",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  paper: {
    label: "Paper",
    description: "Optimized Bukkit fork with plugin support",
    dockerType: "PAPER",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  spigot: {
    label: "Spigot",
    description: "Proven Bukkit fork with plugin support",
    dockerType: "SPIGOT",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  purpur: {
    label: "Purpur",
    description: "Paper fork with extended configuration options",
    dockerType: "PURPUR",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: false,
    group: "vanilla-like",
  },
  forge: {
    label: "Forge",
    description: "Classic mod loader for extensive mods",
    dockerType: "FORGE",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: true,
    group: "modded",
  },
  fabric: {
    label: "Fabric",
    description: "Lightweight mod loader, fast updates",
    dockerType: "FABRIC",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: true,
    group: "modded",
  },
  neoforge: {
    label: "NeoForge",
    description: "Modern Forge fork, actively developed",
    dockerType: "NEOFORGE",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: true,
    group: "modded",
  },
  quilt: {
    label: "Quilt",
    description: "Fabric-compatible loader with extensions",
    dockerType: "QUILT",
    isPack: false,
    supportsManualVersion: true,
    hasLoader: true,
    group: "modded",
  },
  curseforge: {
    label: "CurseForge",
    description: "Install a modpack from CurseForge",
    dockerType: "AUTO_CURSEFORGE",
    packSource: "curseforge",
    isPack: true,
    supportsManualVersion: false,
    hasLoader: false,
    group: "pack",
  },
  modrinth: {
    label: "Modrinth",
    description: "Install a modpack from Modrinth (.mrpack)",
    dockerType: "MODRINTH",
    packSource: "modrinth",
    isPack: true,
    supportsManualVersion: false,
    hasLoader: false,
    group: "pack",
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
  "neoforge",
  "quilt",
  "curseforge",
  "modrinth",
];

/** Helper: derive Docker TYPE string from a serverType, falling back to modLoader */
export function getDockerType(
  serverType?: ServerType | null,
  modLoader?: string | null,
): string {
  if (serverType && SERVER_TYPE_MAP[serverType]?.dockerType) {
    return SERVER_TYPE_MAP[serverType].dockerType;
  }
  if (modLoader) return modLoader.toUpperCase();
  return "VANILLA";
}

/** Helper: all server types use the minecraft runtime */
export function getRuntimeFromType(_serverType: ServerType): "minecraft" {
  return "minecraft";
}
