import "server-only";

import { connectDB } from "@/lib/db/connection";
import { InstalledModuleModel } from "@/lib/db/models/installed-module";

const SMTP_MODULE_ID = "smtp";

async function getSmtpModuleUrl(): Promise<{ url: string; apiKey: string } | null> {
  await connectDB();
  const mod = await InstalledModuleModel.findOne({
    moduleId: SMTP_MODULE_ID,
    status: "running",
  }).lean();

  if (!mod || !mod.internalUrl) return null;

  const apiKey = mod.config.find((c) => c.key === "AETHERA_API_KEY")?.value ?? "";
  return { url: mod.internalUrl, apiKey };
}

export interface SmtpSendResult {
  sent: boolean;
  reason?: string;
}

/**
 * Send a password-reset email via the SMTP module.
 * Returns { sent: false, reason: "no_module" } when the module is not installed/running.
 */
export async function sendPasswordResetMail(opts: {
  to: string;
  username: string;
  tempPassword: string;
}): Promise<SmtpSendResult> {
  const conn = await getSmtpModuleUrl();
  if (!conn) {
    console.log("[smtp-module] Not installed or not running — skipping password-reset mail");
    return { sent: false, reason: "no_module" };
  }

  try {
    const res = await fetch(`${conn.url}/api/mail/password-reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(conn.apiKey ? { Authorization: `Bearer ${conn.apiKey}` } : {}),
      },
      body: JSON.stringify({
        to: opts.to,
        username: opts.username,
        tempPassword: opts.tempPassword,
        appName: process.env.NEXT_PUBLIC_APP_NAME || "Aethera",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as { sent?: boolean; reason?: string };
    return { sent: data.sent ?? false, reason: data.reason };
  } catch (err) {
    console.error("[smtp-module] Request failed:", err);
    return { sent: false, reason: "request_failed" };
  }
}

/**
 * Check whether the SMTP module is currently installed and running.
 */
export async function isSmtpModuleAvailable(): Promise<boolean> {
  const conn = await getSmtpModuleUrl();
  return conn !== null;
}
