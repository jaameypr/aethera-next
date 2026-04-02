import "server-only";

import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";
import type { ModuleManifest } from "@/lib/api/types";

/* ------------------------------------------------------------------ */
/*  API Key provisioning                                               */
/* ------------------------------------------------------------------ */

/**
 * After a Docker module starts, provision an API key using
 * the module's own auth exchange endpoint.
 *
 * The module manifest specifies:
 *   auth.strategy: "api_key"
 *   auth.exchangePath: "/api/auth/api-keys/exchange"
 *   auth.credentials: pulled from the configured env vars
 *
 * The returned key is stored in the InstalledModule document.
 */
export async function provisionApiKey(moduleId: string): Promise<string> {
  await connectDB();

  const doc = await InstalledModuleModel.findOne({ moduleId });
  if (!doc) throw new Error(`Module "${moduleId}" not installed`);
  if (!doc.internalUrl) throw new Error("Module has no internal URL");

  const manifest = doc.manifest as unknown as ModuleManifest;
  const auth = manifest.auth;

  if (!auth || auth.strategy !== "api_key") {
    throw new Error("Module does not support API key auth");
  }

  const exchangePath = auth.exchangePath ?? "/api/auth/api-keys/exchange";

  // Read credentials from the module's configured env vars
  const username = doc.config.find((c) => c.key === "INITIAL_ADMIN_USERNAME")?.value
    ?? "admin";
  const password = doc.config.find((c) => c.key === "INITIAL_ADMIN_PASSWORD")?.value;

  if (!password) {
    throw new Error("Module admin password not configured");
  }

  console.log(
    `[module-auth] Exchanging API key for ${moduleId} — user: "${username}", password length: ${password.length}, url: ${doc.internalUrl}${exchangePath}`,
  );

  // Try configured password first, then fallback to default "changeme"
  const passwords = [password, ...(password !== "changeme" ? ["changeme"] : [])];
  let lastError = "";

  for (const pwd of passwords) {
    const res = await fetch(`${doc.internalUrl}${exchangePath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password: pwd,
        description: "Aethera integration",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data = await res.json();
      const apiKey: string = data.key;

      if (!apiKey) {
        throw new Error("No key returned from exchange endpoint");
      }

      // Store the key (marked as secret)
      const idx = doc.config.findIndex((c) => c.key === "__API_KEY");
      if (idx >= 0) {
        doc.config[idx].value = apiKey;
      } else {
        doc.config.push({ key: "__API_KEY", value: apiKey, secret: true });
      }
      await doc.save();

      return apiKey;
    }

    lastError = await res.text().catch(() => "");
    console.log(`[module-auth] API key exchange attempt failed for ${moduleId} (${res.status}): ${lastError}`);
  }

  throw new Error(`API key exchange failed: ${lastError}`);
}

/**
 * Retrieve the stored API key for a module.
 */
export async function getModuleApiKey(
  moduleId: string,
): Promise<string | null> {
  await connectDB();
  const doc = await InstalledModuleModel.findOne({ moduleId }).lean();
  if (!doc) return null;
  return doc.config.find((c) => c.key === "__API_KEY")?.value ?? null;
}
