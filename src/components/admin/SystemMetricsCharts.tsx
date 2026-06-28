"use client";

import { useState, useEffect, useRef } from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemMetricsPoint {
  ts: number;
  cpuPct: number;
  ramPct: number;
  ramUsedMb: number;
  ramTotalMb: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useSystemMetrics() {
  const [points, setPoints] = useState<SystemMetricsPoint[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/admin/system/metrics/stream");
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data) as {
          ts: string;
          cpuPct: number;
          ramUsedMb: number;
          ramTotalMb: number;
          ramPct: number;
        };
        const point: SystemMetricsPoint = {
          ts: Date.parse(raw.ts),
          cpuPct: raw.cpuPct,
          ramPct: raw.ramPct,
          ramUsedMb: raw.ramUsedMb,
          ramTotalMb: raw.ramTotalMb,
        };
        setPoints((prev) => {
          const next = [...prev, point];
          return next.length > 120 ? next.slice(-120) : next;
        });
      } catch {
        // ignore malformed frames
      }
    };

    es.addEventListener("error", () => setConnected(false));

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { points, connected };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TICK_STYLE = { fill: "#a1a1aa", fontSize: 11 };
const GRID_STROKE = "#3f3f46";
const WARN_THRESHOLD = 70;
const CRIT_THRESHOLD = 90;

function formatTs(v: number): string {
  try {
    return format(new Date(v), "HH:mm:ss");
  } catch {
    return "";
  }
}

/** Small live/offline indicator pill that mirrors the StatusBadge dot idiom. */
function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
      <span className="relative flex h-1.5 w-1.5">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            connected ? "bg-brand" : "bg-zinc-400",
          )}
        />
      </span>
      {connected ? "Live" : "Offline"}
    </span>
  );
}

interface MetricChartProps {
  title: string;
  points: SystemMetricsPoint[];
  connected: boolean;
  dataKey: "cpuPct" | "ramPct";
  /** Hex stroke/gradient color. */
  color: string;
  /** Unique gradient id so the two charts don't collide. */
  gradientId: string;
  value?: number;
  /** Optional extra node under the big value (RAM shows MB). */
  valueSub?: React.ReactNode;
  tooltipLabel: string;
}

function MetricChart({
  title,
  points,
  connected,
  dataKey,
  color,
  gradientId,
  value,
  valueSub,
  tooltipLabel,
}: MetricChartProps) {
  const loading = points.length === 0;
  const hot =
    value !== undefined && value >= CRIT_THRESHOLD
      ? "text-red-500"
      : value !== undefined && value >= WARN_THRESHOLD
        ? "text-amber-500"
        : "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium text-zinc-500">
              {title}
            </CardTitle>
            <ConnectionDot connected={connected} />
          </div>
          <div className="text-right">
            <span
              className={cn(
                "text-2xl font-bold tabular-nums transition-colors",
                hot,
                connected ? "" : "opacity-40",
              )}
            >
              {value !== undefined ? `${value.toFixed(1)}%` : "—"}
            </span>
            {valueSub}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart
              data={points}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              {/* Threshold zones */}
              <ReferenceArea
                y1={WARN_THRESHOLD}
                y2={CRIT_THRESHOLD}
                fill="#f59e0b"
                fillOpacity={0.06}
              />
              <ReferenceArea
                y1={CRIT_THRESHOLD}
                y2={100}
                fill="#ef4444"
                fillOpacity={0.08}
              />
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTs}
                tick={TICK_STYLE}
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} unit="%" tick={TICK_STYLE} width={38} />
              <Tooltip
                contentStyle={{
                  background: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                itemStyle={{ color }}
                labelFormatter={(v) => formatTs(v as number)}
                formatter={(v) => [`${(v as number).toFixed(1)}%`, tooltipLabel]}
              />
              <ReferenceLine
                y={CRIT_THRESHOLD}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── SystemMetricsCharts ───────────────────────────────────────────────────────

export default function SystemMetricsCharts() {
  const { points, connected } = useSystemMetrics();

  const latest = points[points.length - 1];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <MetricChart
        title="CPU-Auslastung"
        points={points}
        connected={connected}
        dataKey="cpuPct"
        color="#818cf8"
        gradientId="sysCpuGradient"
        value={latest?.cpuPct}
        tooltipLabel="CPU"
      />
      <MetricChart
        title="RAM-Auslastung"
        points={points}
        connected={connected}
        dataKey="ramPct"
        color="#34d399"
        gradientId="sysRamGradient"
        value={latest?.ramPct}
        tooltipLabel="RAM"
        valueSub={
          latest !== undefined ? (
            <p className="text-xs text-zinc-500">
              {latest.ramUsedMb.toLocaleString()} /{" "}
              {latest.ramTotalMb.toLocaleString()} MB
            </p>
          ) : undefined
        }
      />
    </div>
  );
}
