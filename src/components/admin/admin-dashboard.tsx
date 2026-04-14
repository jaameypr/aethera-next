"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Server,
  HardDrive,
  RefreshCw,
  Circle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import SystemMetricsCharts from "@/components/admin/SystemMetricsCharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: { privatePort: number; publicPort?: number; type: string }[];
  created: number;
  // per-container metrics enriched by the API route
  cpuPct?: number;
  memPct?: number;
  memUsedMb?: number;
}

interface OrchestratorHealth {
  daemon: "connected" | "disconnected" | "reconnecting";
  circuit: "closed" | "open" | "half-open";
  activeStreams: number;
  pendingOperations: number;
}

interface SystemData {
  docker: OrchestratorHealth | null;
  memory: { total: number; free: number; used: number };
  containers: ContainerInfo[];
  containerCount: { total: number; running: number };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function DaemonBadge({
  status,
}: {
  status: "connected" | "disconnected" | "reconnecting";
}) {
  const { t } = useLocale();
  const colors = {
    connected: "bg-emerald-500",
    disconnected: "bg-red-500",
    reconnecting: "bg-amber-500",
  };
  const labels = {
    connected: t("admin.dashboard.daemonConnected"),
    disconnected: t("admin.dashboard.daemonDisconnected"),
    reconnecting: t("admin.dashboard.daemonReconnecting"),
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={cn("h-2 w-2 rounded-full", colors[status])} />
      {labels[status]}
    </span>
  );
}

function CircuitBadge({
  state,
}: {
  state: "closed" | "open" | "half-open";
}) {
  const { t } = useLocale();
  const colors = {
    closed: "text-emerald-500",
    open: "text-red-500",
    "half-open": "text-amber-500",
  };
  const labels = {
    closed: t("admin.dashboard.circuitClosed"),
    open: t("admin.dashboard.circuitOpen"),
    "half-open": t("admin.dashboard.circuitHalfOpen"),
  };
  return (
    <span className={cn("text-sm font-medium", colors[state])}>
      {labels[state]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-zinc-500">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-zinc-400" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metric Badge
// ---------------------------------------------------------------------------

function MetricBadge({ value }: { value?: number }) {
  if (value === undefined) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  const cls =
    value > 80
      ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400"
      : value >= 50
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium tabular-nums", cls)}>
      {value.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Container Table
// ---------------------------------------------------------------------------

function ContainerTable({ containers }: { containers: ContainerInfo[] }) {
  const { t } = useLocale();
  if (containers.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        {t("admin.dashboard.noContainers")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <th className="px-3 py-2 text-left font-medium text-zinc-500">{t("admin.dashboard.colName")}</th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">{t("admin.dashboard.colImage")}</th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">{t("admin.dashboard.colStatus")}</th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">{t("admin.dashboard.colCpu")}</th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">{t("admin.dashboard.colRam")}</th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">{t("admin.dashboard.colPorts")}</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => (
            <tr
              key={c.id}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
            >
              <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{c.image}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <Circle
                    className={cn(
                      "h-2 w-2 fill-current",
                      c.state === "running"
                        ? "text-emerald-500"
                        : c.state === "exited"
                          ? "text-zinc-400"
                          : "text-amber-500",
                    )}
                  />
                  {c.status}
                </span>
              </td>
              <td className="px-3 py-2">
                <MetricBadge value={c.cpuPct} />
              </td>
              <td className="px-3 py-2">
                <MetricBadge value={c.memPct} />
              </td>
              <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                {c.ports
                  .filter((p) => p.publicPort)
                  .map((p) => `${p.publicPort}→${p.privatePort}`)
                  .join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function AdminDashboardClient({ data }: { data: SystemData }) {
  const [systemData, setSystemData] = useState<SystemData>(data);
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useLocale();

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/system");
      if (res.ok) {
        const json = await res.json();
        setSystemData({
          docker: json.docker,
          memory: json.memory,
          containers: json.containers,
          containerCount: {
            total: json.containers.length,
            running: json.containers.filter(
              (c: ContainerInfo) => c.state === "running",
            ).length,
          },
        });
      }
    } catch {
      // silent refresh failure
    } finally {
      setRefreshing(false);
    }
  }

  // Auto-refresh every 10s (drives container metrics polling)
  useEffect(() => {
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title={t("admin.dashboard.container")}
          value={`${systemData.containerCount.running} / ${systemData.containerCount.total}`}
          subtitle={t("admin.dashboard.runningTotal")}
          icon={Server}
        />
        <StatCard
          title={t("admin.dashboard.dockerDaemon")}
          value={systemData.docker?.daemon ?? t("common.unknown")}
          subtitle={
            systemData.docker
              ? `Circuit: ${systemData.docker.circuit}`
              : undefined
          }
          icon={Activity}
        />
        <StatCard
          title={t("admin.dashboard.activeStreams")}
          value={String(systemData.docker?.activeStreams ?? 0)}
          subtitle={`${systemData.docker?.pendingOperations ?? 0} ${t("admin.dashboard.pendingOps")}`}
          icon={HardDrive}
        />
      </div>

      {/* Live system metrics charts */}
      <SystemMetricsCharts />

      {/* Docker Health */}
      {systemData.docker && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.dashboard.dockerStatus")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">{t("admin.dashboard.daemon")}</span>
              <DaemonBadge status={systemData.docker.daemon} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">{t("admin.dashboard.circuitBreaker")}</span>
              <CircuitBadge state={systemData.docker.circuit} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">{t("admin.dashboard.activeStreams")}</span>
              <span className="text-sm font-medium">
                {systemData.docker.activeStreams}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                {t("admin.dashboard.pendingOps")}
              </span>
              <span className="text-sm font-medium">
                {systemData.docker.pendingOperations}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RAM */}
      {(() => {
        const memUsedPct =
          systemData.memory.total > 0
            ? ((systemData.memory.used / systemData.memory.total) * 100).toFixed(1)
            : "0";
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("admin.dashboard.memory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">{t("admin.dashboard.memUsed")}</span>
                <span className="font-medium">
                  {formatBytes(systemData.memory.used)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    Number(memUsedPct) > 90
                      ? "bg-red-500"
                      : Number(memUsedPct) > 70
                        ? "bg-amber-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${memUsedPct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{t("admin.dashboard.memFree")}: {formatBytes(systemData.memory.free)}</span>
                <span>{t("admin.dashboard.memTotal")}: {formatBytes(systemData.memory.total)}</span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Container list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            {t("admin.dashboard.container")} ({systemData.containers.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </Button>
        </CardHeader>
        <CardContent>
          <ContainerTable containers={systemData.containers} />
        </CardContent>
      </Card>
    </div>
  );
}
