import "server-only";

import nodemailer from "nodemailer";

export function isMailConfigured(): boolean {
  return Boolean(process.env.MAIL_SMTP_HOST && process.env.MAIL_SMTP_HOST.trim() !== "");
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.MAIL_SMTP_HOST,
    port: parseInt(process.env.MAIL_SMTP_PORT || "587", 10),
    secure: process.env.MAIL_SMTP_TLS === "true",
    auth:
      process.env.MAIL_SMTP_AUTH === "true"
        ? {
            user: process.env.MAIL_SMTP_USERNAME,
            pass: process.env.MAIL_SMTP_PASSWORD,
          }
        : undefined,
  });
}

export interface SendMailResult {
  sent: boolean;
  reason?: string;
}

export async function sendMail(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<SendMailResult> {
  if (!isMailConfigured()) {
    console.log(`[Mail] SMTP not configured. Would have sent to ${to}: ${subject}`);
    return { sent: false, reason: "no_smtp" };
  }

  try {
    const transporter = createTransport();
    await transporter.sendMail({
      from: process.env.MAIL_SMTP_SENDER || "noreply@aethera.local",
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    });
    return { sent: true };
  } catch (error) {
    console.error("[Mail] Failed to send:", error);
    return { sent: false, reason: "send_failed" };
  }
}
