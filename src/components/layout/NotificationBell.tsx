"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useLocale } from "@/context/locale-context";
import { formatActivityLabel } from "@/lib/utils/activity-format";

const POLL_MS = 45_000;

interface RecentEntry {
  _id: string;
  projectKey: string;
  action: string;
  actorUsername: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export function NotificationBell() {
  const { t } = useLocale();
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/unread");
      if (!res.ok) return;
      const data = (await res.json()) as { total: number };
      setTotal(data.total);
    } catch {
      /* polling is best-effort */
    }
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/activity/recent");
      if (!res.ok) return;
      setRecent((await res.json()) as RecentEntry[]);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    void fetchUnread();
    timer.current = setInterval(() => void fetchUnread(), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [fetchUnread]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void fetchRecent();
    },
    [fetchRecent],
  );

  const markProjectSeen = useCallback((projectKey: string) => {
    void fetch("/api/activity/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey }),
    })
      .then(() => setTotal((c) => Math.max(0, c - 1)))
      .catch(() => {
        /* best-effort */
      });
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("activity.bell.ariaLabel")}
        >
          <Bell className="h-5 w-5" />
          {total > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
            >
              {total > 99 ? "99+" : total}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("activity.bell.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t("activity.bell.empty")}
          </div>
        ) : (
          recent.map((entry) => (
            <DropdownMenuItem key={entry._id} asChild>
              <Link
                href={`/projects/${entry.projectKey}`}
                onClick={() => markProjectSeen(entry.projectKey)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="line-clamp-2 text-sm">
                  {formatActivityLabel(
                    t,
                    entry.action,
                    entry.actorUsername,
                    entry.details,
                  )}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.projectKey}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/projects" className="justify-center text-sm">
            {t("activity.bell.viewAll")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
