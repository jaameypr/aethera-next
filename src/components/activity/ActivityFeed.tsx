"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon,
  Play,
  Square,
  ArrowUpCircle,
  Database,
  Users,
  Settings,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/context/locale-context";
import { formatActivityLabel } from "@/lib/utils/activity-format";

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

interface ActivityFeedProps {
  projectKey: string;
  pageSize?: number;
}

function iconForAction(action: string) {
  if (action.startsWith("BACKUP")) return Database;
  if (action.startsWith("MEMBER")) return Users;
  if (action === "SERVER_STARTED") return Play;
  if (action === "SERVER_STOPPED") return Square;
  if (action === "SERVER_VERSION_UPDATED") return ArrowUpCircle;
  if (action === "SETTINGS_CHANGED") return Settings;
  return ActivityIcon;
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

export function ActivityFeed({ projectKey, pageSize = 25 }: ActivityFeedProps) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectKey}/logs?page=${nextPage}&size=${pageSize}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as FeedResponse;
        setTotal(data.total);
        setEntries((prev) =>
          nextPage === 1 ? data.entries : [...prev, ...data.entries],
        );
        setPage(nextPage);
      } catch {
        toast.error(t("common.error"));
      } finally {
        setLoading(false);
      }
    },
    [projectKey, pageSize, t],
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const hasMore = entries.length < total;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("activity.feed.title")}</CardTitle>
      </CardHeader>
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
              const Icon = iconForAction(entry.action);
              return (
                <li
                  key={entry._id}
                  className="flex items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent/50"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
            onClick={() => void loadPage(page + 1)}
          >
            {loading ? t("activity.feed.loading") : t("activity.feed.loadMore")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
