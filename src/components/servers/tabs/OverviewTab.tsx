"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, RotateCcw, Loader2, ChevronDown, Trash2, Cpu, MemoryStick } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { cn } from "@/lib/utils";
import MetricsCharts, { useMetricsStream } from "@/components/servers/MetricsCharts";
import { useLocale } from "@/context/locale-context";

const STATUS_STYLES: Record<string, string> = {
  running:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  stopped:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  starting:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  stopping:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  error:
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// Hero status dot: core colour + whether the surrounding ring pulses ("alive").
const STATUS_DOT: Record<string, { core: string; pulse: boolean; glow: boolean }> = {
  running: { core: "bg-brand", pulse: true, glow: true },
  starting: { core: "bg-warning", pulse: true, glow: false },
  stopping: { core: "bg-warning", pulse: true, glow: false },
  stopped: { core: "bg-muted-foreground", pulse: false, glow: false },
  error: { core: "bg-destructive", pulse: false, glow: false },
};

/**
 * Hero status indicator: a core dot inside an (optionally) pulsing ring with a
 * soft glow when the server is alive. Pure CSS animations — reduced-motion safe.
 */
function StatusHero({ status, label }: { status: string; label: string }) {
  const dot = STATUS_DOT[status] ?? STATUS_DOT.stopped;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full px-3 py-1 text-sm font-medium",
        STATUS_STYLES[status] ?? STATUS_STYLES.stopped,
      )}
    >
      <span className="relative flex h-3 w-3 items-center justify-center">
        {dot.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-pulse-ring rounded-full opacity-75",
              dot.core,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            dot.core,
            dot.glow && "shadow-glow-brand",
          )}
        />
      </span>
      {label}
    </span>
  );
}

/** 2-up live CPU% / RAM% summary, animated counters from the metrics stream. */
function LiveSummary({ serverId }: { serverId: string }) {
  const { points } = useMetricsStream(serverId);
  const latest = points[points.length - 1];
  const cpu = latest?.cpu ?? 0;
  const ram = latest?.ramPct ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { icon: Cpu, label: "CPU", value: cpu, tint: "text-brand" },
        { icon: MemoryStick, label: "RAM", value: ram, tint: "text-info" },
      ].map(({ icon: Icon, label, value, tint }) => (
        <Card key={label} className="overflow-hidden">
          <CardContent className="flex items-center gap-3 py-3">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-secondary", tint)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">
                <AnimatedCounter value={value} decimals={1} suffix="%" />
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


export interface ServerPlain {
  _id: string;
  name: string;
  identifier: string;
  status: string;
  runtime: string;
  version?: string;
  modLoader?: string;
  port: number;
  rconPort?: number;
  memory: number;
  image: string;
  tag: string;
  containerId?: string;
  containerStatus?: string;
  javaArgs?: string;
  access: { userId: string; permissions: string[] }[];
  createdAt: string;
}

interface OverviewTabProps {
  server: ServerPlain;
  projectKey: string;
}

export function OverviewTab({ server }: OverviewTabProps) {
  const router = useRouter();
  const { t } = useLocale();

  // liveStatus tracks what we show the user — starts from SSR prop, then updated by polling.
  const [liveStatus, setLiveStatus] = useState(server.status);
  // Which API path is currently being POSTed (just for the button spinner phase).
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // True during a recreate so we don't treat the intermediate "stopped" as terminal.
  const isRecreating = useRef(false);
  // Update-available prompt: holds {current, latest} when /start returns 409.
  const [updatePrompt, setUpdatePrompt] = useState<{ current: string | null; latest: string } | null>(null);

  // Sync liveStatus when the SSR prop refreshes (after router.refresh() completes).
  useEffect(() => {
    setLiveStatus(server.status);
  }, [server.status]);

  const isTransitional = liveStatus === "starting" || liveStatus === "stopping";

  // Poll /status every 2 s while a lifecycle op is in progress.
  useEffect(() => {
    if (!isTransitional) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/servers/${server._id}/status`);
        if (!res.ok || cancelled) return;
        const { status } = (await res.json()) as { status: string };
        if (cancelled) return;

        setLiveStatus(status);

        const reachedTerminal = status !== "starting" && status !== "stopping";
        // For recreate, ignore intermediate "stopped" — wait for "running" or "error".
        const isDone = reachedTerminal && !(isRecreating.current && status === "stopped");

        if (isDone) {
          isRecreating.current = false;
          if (status === "error") {
            toast.error(t("servers.overview.opFailed"));
          }
          router.refresh();
        }
      } catch {
        // transient network error — keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isTransitional, server._id, router]);

  async function handleAction(
    path: string,
    successMsg: string,
    transitionalStatus: "starting" | "stopping",
    opts: { recreate?: boolean } = {},
  ) {
    // Optimistically reflect the new transitional state immediately.
    setLiveStatus(transitionalStatus);
    if (opts.recreate) isRecreating.current = true;
    setPendingAction(path);

    try {
      const res = await fetch(`/api/servers/${server._id}/${path}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? t("servers.overview.actionFailed"));
      }
      toast.success(successMsg);
      // Polling (started above by the isTransitional effect) takes it from here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.overview.actionFailed"));
      setLiveStatus(server.status);
      isRecreating.current = false;
    } finally {
      setPendingAction(null);
    }
  }

  async function startServer(versionAction?: "update" | "keep") {
    setLiveStatus("starting");
    setPendingAction("start");
    try {
      const res = await fetch(`/api/servers/${server._id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(versionAction ? { versionAction } : {}),
      });
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          current?: string | null;
          latest?: string;
        };
        if (body.code === "VERSION_UPDATE_AVAILABLE" && body.latest) {
          setLiveStatus(server.status);
          setUpdatePrompt({ current: body.current ?? null, latest: body.latest });
          return;
        }
        throw new Error((body as { error?: string }).error ?? t("servers.overview.actionFailed"));
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? t("servers.overview.actionFailed"));
      }
      toast.success(t("servers.overview.startToast"));
      // Polling (isTransitional effect) takes over from here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.overview.actionFailed"));
      setLiveStatus(server.status);
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmUpdate(versionAction: "update" | "keep") {
    setUpdatePrompt(null);
    await startServer(versionAction);
  }

  const isRunning = liveStatus === "running";
  const isStopped = liveStatus === "stopped" || liveStatus === "error";

  const spinnerOrIcon = (Icon: React.ComponentType<{ className?: string }>, actionPath: string) =>
    pendingAction === actionPath ? (
      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
    ) : (
      <Icon className="mr-1.5 h-4 w-4" />
    );

  const info: { label: string; value: string; mono?: boolean }[] = [
    { label: "Runtime", value: server.runtime },
    { label: "Version", value: server.version ?? "latest", mono: true },
    { label: "Mod-Loader", value: server.modLoader ?? "Vanilla" },
    { label: "Port", value: String(server.port), mono: true },
    {
      label: "RCON Port",
      value: server.rconPort ? String(server.rconPort) : "—",
      mono: true,
    },
    { label: "RAM", value: `${server.memory} MB` },
    { label: "Identifier", value: server.identifier, mono: true },
    { label: "Image", value: `${server.image}:${server.tag}`, mono: true },
  ];

  const busy = pendingAction !== null || isTransitional;
  // Reason a control is unavailable — surfaced in a tooltip on the disabled button.
  const startReason = isTransitional
    ? t(`servers.status.${liveStatus}`)
    : !isStopped
      ? "Server is already running"
      : null;
  const runningReason = isTransitional
    ? t(`servers.status.${liveStatus}`)
    : !isRunning
      ? "Server must be running"
      : null;

  // Wrap a disabled button so the reason is explained on hover/focus.
  const withReason = (node: React.ReactNode, reason: string | null) =>
    reason ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{node}</span>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="space-y-6">
      {/* Status + Actions */}
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusHero status={liveStatus} label={t(`servers.status.${liveStatus}`)} />

          <div
            className={cn(
              "flex flex-wrap gap-2 transition-opacity duration-200",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {withReason(
              <Button
                size="sm"
                variant="brand"
                onClick={() => startServer()}
                disabled={isTransitional || !isStopped}
              >
                {spinnerOrIcon(Play, "start")}
                {t("servers.overview.start")}
              </Button>,
              startReason,
            )}
            <div className="inline-flex items-center rounded-md">
              {withReason(
                <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-r-none"
                  onClick={() => handleAction("soft-stop", t("servers.overview.stopToast"), "stopping")}
                  disabled={isTransitional || !isRunning}
                >
                  {spinnerOrIcon(Square, "soft-stop")}
                  {t("servers.overview.stop")}
                </Button>,
                runningReason,
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-l-none border-l border-red-700 px-2"
                    disabled={isTransitional || !isRunning}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleAction("stop", t("servers.overview.removeToast"), "stopping")}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("servers.overview.hardclose")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {withReason(
              <Button
                size="sm"
                className="bg-amber-500 text-white hover:bg-amber-600"
                onClick={() => handleAction("recreate", t("servers.overview.restartToast"), "stopping", { recreate: true })}
                disabled={isTransitional || !isRunning}
              >
                {spinnerOrIcon(RotateCcw, "recreate")}
                {t("servers.overview.restart")}
              </Button>,
              runningReason,
            )}
          </div>
        </div>
      </TooltipProvider>

      {/* Live Metrics */}
      {isRunning && (
        <>
          <LiveSummary serverId={server._id} />
          <MetricsCharts serverId={server._id} />
        </>
      )}

      {/* Info Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {info.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-zinc-500">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <p
                className={cn(
                  "break-all text-sm font-semibold",
                  item.mono && "font-mono",
                )}
              >
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Container Info */}
      {server.containerId && (
        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-sm font-medium">{t("servers.overview.container")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-zinc-500">{t("servers.overview.containerId")}</span>
              <span className="break-all font-mono text-zinc-800 dark:text-zinc-200">
                {server.containerId.slice(0, 12)}
              </span>
            </div>
            {server.containerStatus && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-zinc-500">
                  {t("servers.overview.containerStatus")}
                </span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200">
                  {server.containerStatus}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Version-update prompt (shown when /start returns 409 VERSION_UPDATE_AVAILABLE) */}
      <Dialog open={updatePrompt !== null} onOpenChange={(o) => !o && setUpdatePrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("servers.overview.updateTitle")}</DialogTitle>
            <DialogDescription>
              {t("servers.overview.updateDesc", {
                latest: updatePrompt?.latest ?? "",
                current: updatePrompt?.current ?? "—",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setUpdatePrompt(null)}>
              {t("servers.overview.updateCancel")}
            </Button>
            <Button variant="secondary" onClick={() => confirmUpdate("keep")}>
              {t("servers.overview.updateKeep")}
            </Button>
            <Button variant="brand" onClick={() => confirmUpdate("update")}>
              {t("servers.overview.updateConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
