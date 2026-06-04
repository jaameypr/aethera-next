"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon,
  ChevronDown,
  ChevronRight,
  ArrowDownUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { formatActivityLabel } from "@/lib/utils/activity-format";
import { activityVisual } from "@/lib/utils/activity-visuals";

interface FeedEntry {
  _id: string;
  action: string;
  actorUsername: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface FeedResponse {
  entries: FeedEntry[];
  total: number;
  page: number;
  size: number;
}

type SortOrder = "desc" | "asc";

interface ActivityFeedProps {
  projectKey: string;
  pageSize?: number;
  /** Render collapsed behind a toggle (default: always open). */
  collapsible?: boolean;
  /** Called the first time the user expands the feed (e.g. to mark seen). */
  onExpand?: () => void;
}

function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hrs = Math.round(min / 60);
  if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");
  const days = Math.round(hrs / 24);
  return rtf.format(-days, "day");
}

export function ActivityFeed({
  projectKey,
  pageSize = 25,
  collapsible = false,
  onExpand,
}: ActivityFeedProps) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(!collapsible);
  const [sort, setSort] = useState<SortOrder>("desc");
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadPage = useCallback(
    async (nextPage: number, order: SortOrder) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectKey}/logs?page=${nextPage}&size=${pageSize}&sort=${order}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FeedResponse;
        setTotal(data.total);
        setEntries((prev) =>
          nextPage === 1 ? data.entries : [...prev, ...data.entries],
        );
        setPage(nextPage);
        setLoaded(true);
      } catch {
        toast.error(t("common.error"));
      } finally {
        setLoading(false);
      }
    },
    [projectKey, pageSize, t],
  );

  // Load (or reload after a sort change) only while expanded — collapsed feeds
  // never hit the network, so they stay cheap on the project page.
  useEffect(() => {
    if (open && !loaded) void loadPage(1, sort);
  }, [open, loaded, sort, loadPage]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) onExpand?.();
      return next;
    });
  }, [onExpand]);

  const toggleSort = useCallback(() => {
    setSort((prev) => (prev === "desc" ? "asc" : "desc"));
    setLoaded(false); // triggers the effect to refetch page 1 in the new order
  }, []);

  const hasMore = entries.length < total;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={collapsible ? toggleOpen : undefined}
            aria-expanded={open}
            className={cn(
              "flex items-center gap-2 text-left",
              collapsible && "cursor-pointer hover:opacity-80",
            )}
          >
            {collapsible &&
              (open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ))}
            <CardTitle>{t("activity.feed.title")}</CardTitle>
            {loaded && total > 0 && (
              <span className="text-xs text-muted-foreground">({total})</span>
            )}
          </button>
          {open && entries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSort}
              className="gap-1.5 text-xs"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {sort === "desc"
                ? t("activity.feed.sortNewest")
                : t("activity.feed.sortOldest")}
            </Button>
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-3">
          {loading && entries.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<ActivityIcon className="h-6 w-6" />}
              title={t("activity.feed.empty")}
            />
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => {
                const { Icon, className } = activityVisual(entry.action);
                return (
                  <li
                    key={entry._id}
                    className="flex items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/50"
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {formatActivityLabel(
                          t,
                          entry.action,
                          entry.actorUsername,
                          entry.details,
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(entry.createdAt, locale)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={() => void loadPage(page + 1, sort)}
            >
              {loading ? t("activity.feed.loading") : t("activity.feed.loadMore")}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
