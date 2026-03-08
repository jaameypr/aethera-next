import "server-only";

import { connectDB } from "@/lib/db/connection";
import {
  MailTemplateModel,
  type IMailTemplate,
} from "@/lib/db/models/mail-template";

// ---------------------------------------------------------------------------
// Default templates
// ---------------------------------------------------------------------------

const DEFAULTS: Array<{
  key: string;
  subject: string;
  allowedPlaceholders: string[];
  htmlBody: string;
  textBody: string;
}> = [
  {
    key: "welcome",
    subject: "Willkommen bei {{appName}}",
    allowedPlaceholders: ["username", "tempPassword", "appName"],
    htmlBody: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>Willkommen</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#18181b">
  <h1 style="font-size:24px;margin-bottom:8px">Willkommen bei {{appName}}!</h1>
  <p>Hallo <strong>{{username}}</strong>,</p>
  <p>dein Account wurde erfolgreich erstellt. Hier sind deine Zugangsdaten:</p>
  <table style="background:#f4f4f5;border-radius:8px;padding:16px;width:100%">
    <tr><td style="color:#71717a;width:140px">Benutzername</td><td><strong>{{username}}</strong></td></tr>
    <tr><td style="color:#71717a">Temporäres Passwort</td><td><strong>{{tempPassword}}</strong></td></tr>
  </table>
  <p style="margin-top:16px">Bitte ändere dein Passwort nach dem ersten Login.</p>
  <p style="color:#71717a;font-size:12px;margin-top:32px">{{appName}}</p>
</body>
</html>`,
    textBody: `Willkommen bei {{appName}}!

Hallo {{username}},

dein Account wurde erstellt. Deine Zugangsdaten:

  Benutzername:        {{username}}
  Temporäres Passwort: {{tempPassword}}

Bitte ändere dein Passwort nach dem ersten Login.

{{appName}}`,
  },
  {
    key: "password-reset",
    subject: "Dein Passwort wurde zurückgesetzt",
    allowedPlaceholders: ["username", "tempPassword"],
    htmlBody: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>Passwort zurückgesetzt</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#18181b">
  <h1 style="font-size:24px;margin-bottom:8px">Passwort zurückgesetzt</h1>
  <p>Hallo <strong>{{username}}</strong>,</p>
  <p>dein Passwort wurde zurückgesetzt. Dein neues temporäres Passwort lautet:</p>
  <table style="background:#f4f4f5;border-radius:8px;padding:16px;width:100%">
    <tr><td style="color:#71717a;width:140px">Temporäres Passwort</td><td><strong>{{tempPassword}}</strong></td></tr>
  </table>
  <p style="margin-top:16px">Bitte ändere dein Passwort nach dem nächsten Login.</p>
  <p>Falls du diese Aktion nicht angefordert hast, wende dich bitte an einen Administrator.</p>
</body>
</html>`,
    textBody: `Passwort zurückgesetzt

Hallo {{username}},

dein Passwort wurde zurückgesetzt.

  Temporäres Passwort: {{tempPassword}}

Bitte ändere dein Passwort nach dem nächsten Login.
Falls du diese Aktion nicht angefordert hast, wende dich bitte an einen Administrator.`,
  },
  {
    key: "invitation",
    subject: "Du wurdest zu {{appName}} eingeladen",
    allowedPlaceholders: ["username", "tempPassword", "appName"],
    htmlBody: `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>Einladung</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#18181b">
  <h1 style="font-size:24px;margin-bottom:8px">Du wurdest eingeladen!</h1>
  <p>Hallo <strong>{{username}}</strong>,</p>
  <p>du wurdest zu <strong>{{appName}}</strong> eingeladen. Hier sind deine Zugangsdaten:</p>
  <table style="background:#f4f4f5;border-radius:8px;padding:16px;width:100%">
    <tr><td style="color:#71717a;width:140px">Benutzername</td><td><strong>{{username}}</strong></td></tr>
    <tr><td style="color:#71717a">Temporäres Passwort</td><td><strong>{{tempPassword}}</strong></td></tr>
  </table>
  <p style="margin-top:16px">Bitte ändere dein Passwort nach dem ersten Login.</p>
  <p style="color:#71717a;font-size:12px;margin-top:32px">{{appName}}</p>
</body>
</html>`,
    textBody: `Du wurdest zu {{appName}} eingeladen!

Hallo {{username}},

du wurdest eingeladen. Deine Zugangsdaten:

  Benutzername:        {{username}}
  Temporäres Passwort: {{tempPassword}}

Bitte ändere dein Passwort nach dem ersten Login.

{{appName}}`,
  },
];

// ---------------------------------------------------------------------------
// Queries & mutations
// ---------------------------------------------------------------------------

export async function listTemplates(): Promise<IMailTemplate[]> {
  await connectDB();
  return MailTemplateModel.find().sort({ key: 1 }).lean<IMailTemplate[]>();
}

export async function getTemplate(
  key: string,
): Promise<IMailTemplate | null> {
  await connectDB();
  return MailTemplateModel.findOne({ key }).lean<IMailTemplate>();
}

export async function updateTemplate(
  key: string,
  data: { subject: string; htmlBody: string; textBody: string },
): Promise<IMailTemplate> {
  await connectDB();
  const doc = await MailTemplateModel.findOneAndUpdate(
    { key },
    { $set: data },
    { new: true },
  ).lean<IMailTemplate>();
  if (!doc) throw new Error(`Template "${key}" not found`);
  return doc;
}

export async function seedDefaultTemplates(): Promise<void> {
  await connectDB();
  const count = await MailTemplateModel.countDocuments();
  if (count > 0) return;

  await MailTemplateModel.insertMany(DEFAULTS);
}
