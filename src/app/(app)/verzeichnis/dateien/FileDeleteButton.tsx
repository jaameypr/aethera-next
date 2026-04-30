"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";

export function FileDeleteButton({ fileId }: { fileId: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(t("verzeichnis.files.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("verzeichnis.files.deleteError"));
      }
      toast.success(t("verzeichnis.files.deleteSuccess"));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("verzeichnis.files.deleteError"));
      setDeleting(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
      disabled={deleting}
      onClick={handleDelete}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
