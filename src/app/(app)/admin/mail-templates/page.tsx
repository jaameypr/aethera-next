import { requirePermission } from "@/lib/auth/guards";
import {
  listTemplates,
  seedDefaultTemplates,
} from "@/lib/services/mail-template.service";
import { MailTemplatesClient } from "./MailTemplatesClient";

export default async function MailTemplatesPage() {
  await requirePermission("admin.mail");
  await seedDefaultTemplates();

  const templates = await listTemplates();

  const plain = templates.map((t) => ({
    _id: t._id.toString(),
    key: t.key,
    subject: t.subject,
    htmlBody: t.htmlBody,
    textBody: t.textBody,
    allowedPlaceholders: t.allowedPlaceholders,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mail Templates</h1>
        <p className="text-sm text-zinc-500">
          E-Mail-Vorlagen bearbeiten. Platzhalter werden beim Versand ersetzt.
        </p>
      </div>

      <MailTemplatesClient initialTemplates={plain} />
    </div>
  );
}
