/**
 * Runtime version constants — available on both server and client.
 *
 * NEXT_PUBLIC_APP_VERSION is injected at build time by next.config.ts
 * from the `version` field in package.json.
 */

export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

export const APP_CHANNEL: "stable" | "edge" | "experimental" =
  (process.env.AETHERA_CHANNEL as "stable" | "edge" | "experimental") ??
  "stable";
