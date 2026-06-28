"use client";

import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useLocale } from "@/context/locale-context";

interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  mandatory: boolean;
  changelog: string;
}

interface VersionAvailableAlertProps {
  /** Whether the viewer holds `system.update`; gates the "Update now" action. */
  canUpdate: boolean;
}

/**
 * Admin-only dashboard banner shown when a newer Aethera panel version exists.
 *
 * One-shot fetch of `/api/admin/version-status` on mount (no polling); renders
 * nothing unless an update is available. The "Update now" action is only
 * offered when the viewer may apply updates.
 */
export function VersionAvailableAlert({ canUpdate }: VersionAvailableAlertProps) {
  const { t } = useLocale();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/version-status");
        if (!res.ok) return;
        const data = (await res.json()) as UpdateStatus;
        if (!cancelled) setStatus(data);
      } catch {
        /* best-effort — the boot log + manual check remain available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpdate() {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      if (res.status === 409) {
        toast.error(t("admin.update.busy"));
        return;
      }
      if (!res.ok) {
        toast.error(t("admin.update.error"));
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.restarting) {
        toast.success(t("admin.update.success"));
      } else {
        // Pull-only mode (AETHERA_SELF_UPDATE not enabled): the image was
        // pulled but the container was NOT recreated — tell the admin how.
        toast.info(t("admin.update.pulledManual"));
      }
    } catch {
      toast.error(t("admin.update.error"));
    } finally {
      setUpdating(false);
    }
  }

  if (dismissed || !status?.updateAvailable) return null;

  const latest = status.latest ?? "";

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              {t("version.available.title", { version: latest })}
            </p>
            <p className="text-sm text-amber-800/80 dark:text-amber-200/70">
              {t("version.available.description")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {status.changelog ? (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("version.available.changelog")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {t("version.available.title", { version: latest })}
                  </DialogTitle>
                  <DialogDescription className="whitespace-pre-wrap">
                    {status.changelog}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          ) : null}

          {canUpdate ? (
            <Button
              variant="brand"
              size="sm"
              onClick={handleUpdate}
              disabled={updating}
            >
              {updating
                ? t("admin.update.updating")
                : t("admin.update.updateNow")}
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("version.available.dismiss")}
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
