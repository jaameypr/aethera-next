"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Server,
  HardDrive,
  MemoryStick,
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
  const colors = {
    connected: "bg-emerald-500",
    disconnected: "bg-red-500",
    reconnecting: "bg-amber-500",
  };
  const labels = {
    connected: "Verbunden",
    disconnected: "Getrennt",
    reconnecting: "Verbindung wird hergestellt…",
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
  const colors = {
    closed: "text-emerald-500",
    open: "text-red-500",
    "half-open": "text-amber-500",
  };
  const labels = {
    closed: "Geschlossen (OK)",
    open: "Offen (Fehler)",
    "half-open": "Halb-offen",
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
// Container Table
// ---------------------------------------------------------------------------

function ContainerTable({ containers }: { containers: ContainerInfo[] }) {
  if (containers.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        Keine Container gefunden
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <th className="px-3 py-2 text-left font-medium text-zinc-500">
              Name
            </th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">
              Image
            </th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">
              Status
            </th>
            <th className="px-3 py-2 text-left font-medium text-zinc-500">
              Ports
            </th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => (
            <tr
              key={c.id}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
            >
              <td className="px-3 py-2 font-mono text-xs">{c.name}</td>
              <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                {c.image}
              </td>
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

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  const memUsedPct =
    systemData.memory.total > 0
      ? ((systemData.memory.used / systemData.memory.total) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6">
      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Container"
          value={`${systemData.containerCount.running} / ${systemData.containerCount.total}`}
          subtitle="Running / Total"
          icon={Server}
        />
        <StatCard
          title="RAM-Nutzung"
          value={`${memUsedPct}%`}
          subtitle={`${formatBytes(systemData.memory.used)} / ${formatBytes(systemData.memory.total)}`}
          icon={MemoryStick}
        />
        <StatCard
          title="Docker Daemon"
          value={systemData.docker?.daemon ?? "unbekannt"}
          subtitle={
            systemData.docker
              ? `Circuit: ${systemData.docker.circuit}`
              : undefined
          }
          icon={Activity}
        />
        <StatCard
          title="Aktive Streams"
          value={String(systemData.docker?.activeStreams ?? 0)}
          subtitle={`${systemData.docker?.pendingOperations ?? 0} ausstehend`}
          icon={HardDrive}
        />
      </div>

      {/* Docker Health */}
      {systemData.docker && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Docker-Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Daemon</span>
              <DaemonBadge status={systemData.docker.daemon} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Circuit Breaker</span>
              <CircuitBadge state={systemData.docker.circuit} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Aktive Streams</span>
              <span className="text-sm font-medium">
                {systemData.docker.activeStreams}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                Ausstehende Operationen
              </span>
              <span className="text-sm font-medium">
                {systemData.docker.pendingOperations}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* RAM progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arbeitsspeicher</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Belegt</span>
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
            <span>Frei: {formatBytes(systemData.memory.free)}</span>
            <span>Total: {formatBytes(systemData.memory.total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Container list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Container ({systemData.containers.length})
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
