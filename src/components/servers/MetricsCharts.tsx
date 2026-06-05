"use client";

import { useState, useEffect, useRef } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetricsPoint {
  ts: number;
  cpu: number;
  ramPct: number;
  ramUsedMb: number;
}

interface UseMetricsStreamResult {
  points: MetricsPoint[];
  connected: boolean;
  error: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMetricsStream(serverId: string): UseMetricsStreamResult {
  const [points, setPoints] = useState<MetricsPoint[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/servers/${serverId}/metrics/stream`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as {
          ts: string;
          cpu: number;
          ramUsed: number;
          ramPct: number;
        };
        const point: MetricsPoint = {
          ts: Date.parse(raw.ts),
          cpu: raw.cpu,
          ramPct: raw.ramPct,
          ramUsedMb: raw.ramUsed / 1024 / 1024,
        };
        setPoints((prev) => {
          const next = [...prev, point];
          return next.length > 100 ? next.slice(-100) : next;
        });
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener("error", (event) => {
      if (es.readyState === EventSource.CLOSED) {
        setConnected(false);
        setError("Verbindung unterbrochen");
      } else if (es.readyState === EventSource.CONNECTING) {
        setConnected(false);
      }
      const messageEvent = event as MessageEvent;
      if (messageEvent.data) {
        try {
          const { error: errMsg } = JSON.parse(messageEvent.data) as { error?: string };
          if (errMsg) setError(errMsg);
        } catch { /* ignore */ }
      }
    });

    es.addEventListener("end", () => {
      setConnected(false);
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [serverId]);

  return { points, connected, error };
}

// ── Shared chart config ───────────────────────────────────────────────────────

const TICK_STYLE = { fill: "#a1a1aa", fontSize: 11 };
const GRID_STROKE = "#3f3f46";

// Threshold bands: faint warning 60–80%, faint destructive >80%.
const WARN_FILL = "#f59e0b"; // warning (amber)
const DANGER_FILL = "#ef4444"; // destructive (red)

function formatTs(v: number): string {
  try {
    return format(new Date(v), "HH:mm:ss");
  } catch {
    return "";
  }
}

/** Renders the faint 60–80% warning + >80% danger threshold bands. */
function ThresholdBands() {
  return (
    <>
      <ReferenceArea y1={60} y2={80} fill={WARN_FILL} fillOpacity={0.06} ifOverflow="extendDomain" />
      <ReferenceArea y1={80} y2={100} fill={DANGER_FILL} fillOpacity={0.06} ifOverflow="extendDomain" />
    </>
  );
}

/** A glowing dot for the most recent point only (last index). */
function makeGlowDot(color: string, lastIndex: number) {
  function GlowDot(props: { cx?: number; cy?: number; index?: number }) {
    const { cx, cy, index } = props;
    if (cx == null || cy == null || index !== lastIndex) return <g />;
    return (
      <g>
        <circle cx={cx} cy={cy} r={6} fill={color} opacity={0.25} className="animate-pulse-soft" />
        <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1} />
      </g>
    );
  }
  return GlowDot;
}

// ── CpuChart ──────────────────────────────────────────────────────────────────

export function CpuChart({ points }: { points: MetricsPoint[] }) {
  const lastIndex = points.length - 1;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <ThresholdBands />
        <XAxis
          dataKey="ts"
          tickFormatter={formatTs}
          tick={TICK_STYLE}
          minTickGap={40}
        />
        <YAxis domain={[0, 100]} unit="%" tick={TICK_STYLE} width={42} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
          labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
          itemStyle={{ color: "#22c55e" }}
          labelFormatter={(v) => formatTs(v as number)}
          formatter={(v) => [`${(v as number).toFixed(1)}%`, "CPU"]}
        />
        <ReferenceLine y={80} stroke="red" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="cpu"
          stroke="#22c55e"
          strokeWidth={1.5}
          fill="url(#cpuFill)"
          dot={makeGlowDot("#22c55e", lastIndex)}
          activeDot={{ r: 4 }}
          isAnimationActive
          animationDuration={300}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── RamChart ──────────────────────────────────────────────────────────────────

function RamTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload as MetricsPoint | undefined;
  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs">
      <p className="mb-1 text-zinc-400">
        {typeof label === "number" ? formatTs(label) : String(label)}
      </p>
      <p className="text-blue-400">{pt?.ramPct.toFixed(1)}%</p>
      <p className="text-zinc-300">{pt?.ramUsedMb.toFixed(0)} MB verwendet</p>
    </div>
  );
}

export function RamChart({ points }: { points: MetricsPoint[] }) {
  const lastIndex = points.length - 1;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="ramFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <ThresholdBands />
        <XAxis
          dataKey="ts"
          tickFormatter={formatTs}
          tick={TICK_STYLE}
          minTickGap={40}
        />
        <YAxis domain={[0, 100]} unit="%" tick={TICK_STYLE} width={42} />
        <Tooltip content={RamTooltip} />
        <ReferenceLine y={80} stroke="red" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="ramPct"
          stroke="#6366f1"
          strokeWidth={1.5}
          fill="url(#ramFill)"
          dot={makeGlowDot("#6366f1", lastIndex)}
          activeDot={{ r: 4 }}
          isAnimationActive
          animationDuration={300}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── MetricsCharts (default export) ───────────────────────────────────────────

/** Live connection status line: pulsing brand dot streaming / destructive reconnecting. */
function ConnectionHeader({ connected, error }: { connected: boolean; error: string | null }) {
  const { t } = useLocale();
  const ok = connected && !error;
  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      <span className="relative flex h-2 w-2">
        {ok && (
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            ok ? "bg-brand" : "bg-destructive animate-pulse-soft",
          )}
        />
      </span>
      <span className={ok ? "text-brand" : "text-destructive"}>
        {ok ? t("servers.overview.streaming") : t("servers.overview.reconnecting")}
      </span>
    </div>
  );
}

/** Shimmer placeholder for a single chart cell while we wait for the first frame. */
function ChartSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <Skeleton className="h-[200px] w-full rounded-md" />
    </div>
  );
}

export default function MetricsCharts({ serverId }: { serverId: string }) {
  const { points, connected, error } = useMetricsStream(serverId);

  // No data yet AND no live connection → shimmering skeleton instead of bare text.
  if (points.length === 0 && !connected) {
    return (
      <div className="space-y-4 animate-fade-in">
        <ConnectionHeader connected={connected} error={error} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton label="CPU" />
          <ChartSkeleton label="RAM" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ConnectionHeader connected={connected} error={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4 shadow-z1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">CPU</p>
          <CpuChart points={points} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-z1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">RAM</p>
          <RamChart points={points} />
        </div>
      </div>
    </div>
  );
}
