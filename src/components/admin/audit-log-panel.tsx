"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  ScrollText,
  SlidersHorizontal,
  ArrowDownUp,
  ChevronDown,
  X,
  Server as ServerIcon,
  FolderKanban,
  User as UserIcon,
} from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { formatActivityLabel } from "@/lib/utils/activity-format";
import { activityVisual } from "@/lib/utils/activity-visuals";
import { ACTION_GROUPS, ALL_ACTIONS } from "@/lib/utils/activity-groups";
import type { ProjectLogAction } from "@/lib/db/models/project-log";
import type { AuditEntry, AuditFilterOptions } from "@/lib/services/audit.service";

const ALL = "__all__";
const SPRING = "cubic-bezier(0.22,1,0.36,1)";

interface AuditLogPanelProps {
  options: AuditFilterOptions;
  initialEntries: AuditEntry[];
  initialTotal: number;
  pageSize: number;
}

/* ------------------------------------------------------------------ */
/* Time helpers                                                       */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hrs = Math.round(min / 60);
  if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");
  const days = Math.round(hrs / 24);
  if (Math.abs(days) < 30) return rtf.format(-days, "day");
  const months = Math.round(days / 30);
  return rtf.format(-months, "month");
}

function absoluteTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* ------------------------------------------------------------------ */
/* Double-bezel shell — a glass plate sitting in a machined tray.     */
/* ------------------------------------------------------------------ */

function Bezel({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] bg-secondary/40 p-1.5 ring-1 ring-black/[0.04] shadow-z2 dark:bg-white/[0.03] dark:ring-white/10",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-[calc(1.75rem-0.375rem)] bg-card shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll-reveal row                                                  */
/* ------------------------------------------------------------------ */

function Reveal({ children, index }: { children: ReactNode; index: number }) {
  const ref = useRef<HTMLLIElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      // Defer to the next frame so this never cascades within the effect commit.
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <li
      ref={ref}
      style={{
        transitionTimingFunction: SPRING,
        transitionDelay: shown ? `${Math.min(index, 8) * 40}ms` : "0ms",
      }}
      className={cn(
        "relative flex gap-4 transition-all duration-700",
        shown
          ? "translate-y-0 opacity-100 blur-0"
          : "translate-y-3 opacity-0 blur-[2px]",
      )}
    >
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Action-type grouped multi-select                                   */
/* ------------------------------------------------------------------ */

function ActionTypeMenu({
  selected,
  onChange,
}: {
  selected: ProjectLogAction[];
  onChange: (next: ProjectLogAction[]) => void;
}) {
  const { t } = useLocale();
  const set = useMemo(() => new Set(selected), [selected]);

  const toggle = (a: ProjectLogAction) => {
    const next = new Set(set);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    onChange(ALL_ACTIONS.filter((x) => next.has(x)));
  };

  const toggleGroup = (actions: ProjectLogAction[]) => {
    const allOn = actions.every((a) => set.has(a));
    const next = new Set(set);
    actions.forEach((a) => (allOn ? next.delete(a) : next.add(a)));
    onChange(ALL_ACTIONS.filter((x) => next.has(x)));
  };

  const summary =
    selected.length === 0
      ? t("activity.audit.filters.allActions")
      : t("activity.audit.filters.actionsSelected", { count: selected.length });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition-colors",
            "hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background dark:hover:border-zinc-600",
          )}
        >
          <span className={cn(selected.length === 0 && "text-muted-foreground")}>
            {summary}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[60vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-2"
      >
        {ACTION_GROUPS.map((group) => {
          const allOn = group.actions.every((a) => set.has(a));
          return (
            <div key={group.key} className="mb-1 last:mb-0">
              <button
                type="button"
                onClick={() => toggleGroup(group.actions)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-accent"
              >
                {t(`activity.audit.groups.${group.key}`)}
                <span className="text-[10px] font-medium normal-case text-brand">
                  {allOn ? "✓" : t("activity.audit.filters.selectAll")}
                </span>
              </button>
              {group.actions.map((a) => {
                const { Icon, className } = activityVisual(a);
                return (
                  <label
                    key={a}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={set.has(a)}
                      onCheckedChange={() => toggle(a)}
                    />
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} />
                    <span className="min-w-0 flex-1 truncate">
                      {t(`activity.audit.actionLabels.${a}`)}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* Filter field shell                                                 */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Removable active-filter chip                                       */
/* ------------------------------------------------------------------ */

function Chip({
  icon,
  label,
  onClear,
}: {
  icon: ReactNode;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/70 py-1 pl-2.5 pr-1.5 text-xs font-medium">
      {icon}
      <span className="max-w-[12rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-200 hover:bg-destructive/15 hover:text-destructive active:scale-90"
        style={{ transitionTimingFunction: SPRING }}
        aria-label="remove filter"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/* ================================================================== */
/* Panel                                                              */
/* ================================================================== */

export function AuditLogPanel({
  options,
  initialEntries,
  initialTotal,
  pageSize,
}: AuditLogPanelProps) {
  const { t, locale } = useLocale();

  const [projectKey, setProjectKey] = useState("");
  const [serverId, setServerId] = useState("");
  const [actor, setActor] = useState("");
  const [actions, setActions] = useState<ProjectLogAction[]>([]);
  const [sort, setSort] = useState<"desc" | "asc">("desc");

  const [entries, setEntries] = useState<AuditEntry[]>(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const mounted = useRef(false);

  // Servers narrow to the chosen project; otherwise the full fleet is offered.
  const serverOptions = useMemo(
    () =>
      projectKey
        ? options.servers.filter((s) => s.projectKey === projectKey)
        : options.servers,
    [options.servers, projectKey],
  );

  const actionsKey = useMemo(() => actions.slice().sort().join(","), [actions]);
  const activeCount =
    (projectKey ? 1 : 0) +
    (serverId ? 1 : 0) +
    (actor ? 1 : 0) +
    (actions.length ? 1 : 0);

  async function load(targetPage: number, reset: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("size", String(pageSize));
      params.set("sort", sort);
      if (projectKey) params.set("project", projectKey);
      if (serverId) params.set("server", serverId);
      if (actor) params.set("actor", actor);
      if (actions.length) params.set("actions", actions.join(","));

      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        entries: AuditEntry[];
        total: number;
      };
      setTotal(data.total);
      setEntries((prev) => (reset ? data.entries : [...prev, ...data.entries]));
      setPage(targetPage);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  // Refetch page 1 whenever a filter or the sort order changes. The first render
  // is skipped — the server already handed us the unfiltered, newest-first page.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    void load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, serverId, actor, actionsKey, sort]);

  const onProjectChange = (v: string) => {
    const next = v === ALL ? "" : v;
    setProjectKey(next);
    setServerId(""); // the previously-picked server may not live in this project
  };

  const resetAll = () => {
    setProjectKey("");
    setServerId("");
    setActor("");
    setActions([]);
  };

  const projectName = (key: string) =>
    options.projects.find((p) => p.key === key)?.name ?? key;
  const serverName = (id: string) =>
    options.servers.find((s) => s.id === id)?.name ?? id;
  const actorName = (id: string) =>
    options.actors.find((a) => a.id === id)?.username ?? id;

  // Group the (already-ordered) entries into day buckets.
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: AuditEntry[] }[] = [];
    const today = startOfDay(new Date());
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const key = d.toDateString();
      let label: string;
      const diff = Math.round((today - startOfDay(d)) / 86_400_000);
      if (diff === 0) label = t("activity.audit.today");
      else if (diff === 1) label = t("activity.audit.yesterday");
      else
        label = new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(d);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, label, items: [e] });
    }
    return out;
  }, [entries, locale, t]);

  const hasMore = entries.length < total;
  const isFiltered = activeCount > 0;
  let rowIndex = 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8 pb-10">
      {/* ---- Header ---- */}
      <header className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
          </span>
          {t("activity.audit.eyebrow")}
        </span>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
              <ScrollText className="h-7 w-7 text-brand sm:h-8 sm:w-8" />
              {t("activity.audit.title")}
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              {t("activity.audit.subtitle")}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums text-muted-foreground">
              {t("activity.audit.results", { count: total })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {sort === "desc"
                ? t("activity.audit.sortNewest")
                : t("activity.audit.sortOldest")}
            </Button>
          </div>
        </div>
      </header>

      {/* ---- Body: filter rail + timeline ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Filter rail */}
        <aside className="h-max lg:sticky lg:top-2">
          <Bezel innerClassName="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">
                  {t("activity.audit.filters.heading")}
                </h2>
                {activeCount > 0 && (
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">
                    {activeCount}
                  </span>
                )}
              </div>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {t("activity.audit.filters.reset")}
                </button>
              )}
            </div>

            <div className="space-y-4">
              <Field label={t("activity.audit.filters.project")}>
                <Select
                  value={projectKey || ALL}
                  onValueChange={onProjectChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t("activity.audit.filters.allProjects")}
                    </SelectItem>
                    {options.projects.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("activity.audit.filters.server")}>
                <Select
                  value={serverId || ALL}
                  onValueChange={(v) => setServerId(v === ALL ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t("activity.audit.filters.allServers")}
                    </SelectItem>
                    {serverOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {!projectKey && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            · {s.projectKey}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!projectKey && (
                  <p className="px-0.5 text-[11px] text-muted-foreground">
                    {t("activity.audit.filters.serverHint")}
                  </p>
                )}
              </Field>

              <Field label={t("activity.audit.filters.action")}>
                <ActionTypeMenu selected={actions} onChange={setActions} />
              </Field>

              <Field label={t("activity.audit.filters.actor")}>
                <Select
                  value={actor || ALL}
                  onValueChange={(v) => setActor(v === ALL ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>
                      {t("activity.audit.filters.allActors")}
                    </SelectItem>
                    {options.actors.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Bezel>
        </aside>

        {/* Timeline */}
        <Bezel>
          {/* active chips */}
          {isFiltered && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
              {projectKey && (
                <Chip
                  icon={<FolderKanban className="h-3 w-3 text-brand" />}
                  label={projectName(projectKey)}
                  onClear={() => onProjectChange(ALL)}
                />
              )}
              {serverId && (
                <Chip
                  icon={<ServerIcon className="h-3 w-3 text-brand" />}
                  label={serverName(serverId)}
                  onClear={() => setServerId("")}
                />
              )}
              {actor && (
                <Chip
                  icon={<UserIcon className="h-3 w-3 text-brand" />}
                  label={actorName(actor)}
                  onClear={() => setActor("")}
                />
              )}
              {actions.length > 0 && (
                <Chip
                  icon={<SlidersHorizontal className="h-3 w-3 text-brand" />}
                  label={t("activity.audit.filters.actionsSelected", {
                    count: actions.length,
                  })}
                  onClear={() => setActions([])}
                />
              )}
            </div>
          )}

          <div className="p-4 sm:p-6">
            {loading && entries.length === 0 ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2 pb-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="h-6 w-6" />}
                title={
                  isFiltered
                    ? t("activity.audit.emptyFiltered")
                    : t("activity.audit.empty")
                }
                description={
                  isFiltered
                    ? t("activity.audit.emptyFilteredDesc")
                    : t("activity.audit.emptyDesc")
                }
                action={
                  isFiltered ? (
                    <Button variant="outline" size="sm" onClick={resetAll}>
                      {t("activity.audit.filters.reset")}
                    </Button>
                  ) : undefined
                }
                className="border-0"
              />
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="space-y-7">
                  {groups.map((group) => (
                    <div key={group.key}>
                      <div className="mb-3 flex items-center gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {group.label}
                        </h3>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <ul>
                        {group.items.map((entry, i) => {
                          const { Icon, className } = activityVisual(
                            entry.action,
                          );
                          const isLast = i === group.items.length - 1;
                          return (
                            <Reveal key={entry._id} index={rowIndex++}>
                              {/* node + connector */}
                              <div className="relative flex flex-col items-center">
                                <span className="z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-z1">
                                  <Icon
                                    className={cn("h-4 w-4", className)}
                                  />
                                </span>
                                {!isLast && (
                                  <span className="w-px flex-1 bg-gradient-to-b from-border to-transparent" />
                                )}
                              </div>

                              {/* content */}
                              <div
                                className="-mx-3 mb-2 flex-1 rounded-xl px-3 py-1.5 transition-[background-color,transform] duration-300 hover:translate-x-0.5 hover:bg-accent/40"
                                style={{ transitionTimingFunction: SPRING }}
                              >
                                <p className="text-sm leading-snug">
                                  {formatActivityLabel(
                                    t,
                                    entry.action,
                                    entry.actorUsername,
                                    entry.details,
                                  )}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[11px]">
                                    <FolderKanban className="h-3 w-3" />
                                    {entry.projectName}
                                  </span>
                                  {entry.serverName && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                                      <ServerIcon className="h-3 w-3" />
                                      {entry.serverName}
                                    </span>
                                  )}
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-default tabular-nums">
                                        {relativeTime(entry.createdAt, locale)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {absoluteTime(entry.createdAt, locale)}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </Reveal>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* footer: count + load more */}
                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("activity.audit.showing", {
                      shown: entries.length,
                      total,
                    })}
                  </p>
                  {hasMore && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void load(page + 1, false)}
                      className="group inline-flex items-center gap-3 rounded-full border border-border bg-card py-2 pl-5 pr-2 text-sm font-medium shadow-z1 transition-[transform,box-shadow,border-color] duration-300 hover:border-zinc-300 hover:shadow-z2 active:scale-[0.98] disabled:opacity-60 dark:hover:border-zinc-600"
                      style={{ transitionTimingFunction: SPRING }}
                    >
                      {loading
                        ? t("activity.audit.loading")
                        : t("activity.audit.loadMore")}
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-transform duration-300 group-hover:translate-y-0.5 group-hover:scale-105"
                        style={{ transitionTimingFunction: SPRING }}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </span>
                    </button>
                  )}
                </div>
              </TooltipProvider>
            )}
          </div>
        </Bezel>
      </div>
    </div>
  );
}
