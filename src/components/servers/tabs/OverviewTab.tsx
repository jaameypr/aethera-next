"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Square, RotateCcw, Loader2, ChevronDown, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import MetricsCharts from "@/components/servers/MetricsCharts";

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

const STATUS_LABELS: Record<string, string> = {
  running: "Läuft",
  stopped: "Gestoppt",
  starting: "Startet…",
  stopping: "Stoppt…",
  error: "Fehler",
};

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

  // liveStatus tracks what we show the user — starts from SSR prop, then updated by polling.
  const [liveStatus, setLiveStatus] = useState(server.status);
  // Which API path is currently being POSTed (just for the button spinner phase).
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  // True during a recreate so we don't treat the intermediate "stopped" as terminal.
  const isRecreating = useRef(false);

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
            toast.error("Server-Operation fehlgeschlagen");
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
        throw new Error((body as { error?: string }).error ?? "Aktion fehlgeschlagen");
      }
      toast.success(successMsg);
      // Polling (started above by the isTransitional effect) takes it from here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
      setLiveStatus(server.status);
      isRecreating.current = false;
    } finally {
      setPendingAction(null);
    }
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

  return (
    <div className="space-y-6">
      {/* Status + Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
            STATUS_STYLES[liveStatus] ?? STATUS_STYLES.stopped,
          )}
        >
          {isTransitional && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {STATUS_LABELS[liveStatus] ?? liveStatus}
        </span>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => handleAction("start", "Server wird gestartet", "starting")}
            disabled={isTransitional || !isStopped}
          >
            {spinnerOrIcon(Play, "start")}
            Starten
          </Button>
          <div className="inline-flex items-center rounded-md">
            <Button
              size="sm"
              variant="destructive"
              className="rounded-r-none"
              onClick={() => handleAction("soft-stop", "Server wird gestoppt", "stopping")}
              disabled={isTransitional || !isRunning}
            >
              {spinnerOrIcon(Square, "soft-stop")}
              Stoppen
            </Button>
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
                  onClick={() => handleAction("stop", "Server wird entfernt", "stopping")}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Hardclose (Container löschen)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            size="sm"
            className="bg-amber-500 text-white hover:bg-amber-600"
            onClick={() => handleAction("recreate", "Server wird neu gestartet", "stopping", { recreate: true })}
            disabled={isTransitional || !isRunning}
          >
            {spinnerOrIcon(RotateCcw, "recreate")}
            Neustarten
          </Button>
        </div>
      </div>

      {/* Live Metrics */}
      {isRunning && <MetricsCharts serverId={server._id} />}

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
            <CardTitle className="text-sm font-medium">Container</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 pb-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-zinc-500">Container ID</span>
              <span className="break-all font-mono text-zinc-800 dark:text-zinc-200">
                {server.containerId.slice(0, 12)}
              </span>
            </div>
            {server.containerStatus && (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 text-zinc-500">
                  Container Status
                </span>
                <span className="font-mono text-zinc-800 dark:text-zinc-200">
                  {server.containerStatus}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
