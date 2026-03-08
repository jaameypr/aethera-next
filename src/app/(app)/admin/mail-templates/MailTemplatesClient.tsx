"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface MailTemplate {
  _id: string;
  key: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  allowedPlaceholders: string[];
}

interface Props {
  initialTemplates: MailTemplate[];
}

const TEMPLATE_LABELS: Record<string, string> = {
  welcome: "Willkommens-E-Mail",
  "password-reset": "Passwort zurückgesetzt",
  invitation: "Einladung",
};

export function MailTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialTemplates[0]?.key ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"html" | "text">("html");

  const selected = templates.find((t) => t.key === selectedKey) ?? null;

  function updateField(
    field: "subject" | "htmlBody" | "textBody",
    value: string,
  ) {
    setTemplates((prev) =>
      prev.map((t) => (t.key === selectedKey ? { ...t, [field]: value } : t)),
    );
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/mail/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selected.key,
          subject: selected.subject,
          htmlBody: selected.htmlBody,
          textBody: selected.textBody,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Fehler beim Speichern");
      }
      toast.success("Template gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex gap-6">
      {/* Template list */}
      <aside className="w-56 shrink-0 space-y-1">
        {templates.map((t) => (
          <button
            key={t.key}
            onClick={() => setSelectedKey(t.key)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              t.key === selectedKey
                ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
            )}
          >
            <span className="truncate">
              {TEMPLATE_LABELS[t.key] ?? t.key}
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </button>
        ))}
      </aside>

      {/* Editor */}
      {selected ? (
        <div className="min-w-0 flex-1 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">
                {TEMPLATE_LABELS[selected.key] ?? selected.key}
              </h2>
              <p className="font-mono text-xs text-zinc-400">{selected.key}</p>
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {saving ? "Speichere…" : "Speichern"}
            </Button>
          </div>

          {/* Variables reference */}
          {selected.allowedPlaceholders.length > 0 && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-1.5 text-xs font-medium text-zinc-500">
                Verfügbare Platzhalter
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selected.allowedPlaceholders.map((v) => (
                  <code
                    key={v}
                    className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                  >
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="subject">Betreff</Label>
            <Input
              id="subject"
              value={selected.subject}
              onChange={(e) => updateField("subject", e.target.value)}
            />
          </div>

          {/* Body tabs */}
          <div className="space-y-1.5">
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
              {(["html", "text"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
                    activeTab === tab
                      ? "border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
                  )}
                >
                  {tab === "html" ? "HTML" : "Plaintext"}
                </button>
              ))}
            </div>

            {activeTab === "html" ? (
              <textarea
                value={selected.htmlBody}
                onChange={(e) => updateField("htmlBody", e.target.value)}
                rows={18}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                spellCheck={false}
              />
            ) : (
              <textarea
                value={selected.textBody}
                onChange={(e) => updateField("textBody", e.target.value)}
                rows={18}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                spellCheck={false}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          Kein Template ausgewählt
        </div>
      )}
    </div>
  );
}
