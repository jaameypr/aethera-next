"use client";

import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import { format } from "date-fns";

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

function formatTs(v: number): string {
  try {
    return format(new Date(v), "HH:mm:ss");
  } catch {
    return "";
  }
}

// ── CpuChart ──────────────────────────────────────────────────────────────────

export function CpuChart({ points }: { points: MetricsPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
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
        <Line
          type="monotone"
          dataKey="cpu"
          stroke="#22c55e"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
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
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="ts"
          tickFormatter={formatTs}
          tick={TICK_STYLE}
          minTickGap={40}
        />
        <YAxis domain={[0, 100]} unit="%" tick={TICK_STYLE} width={42} />
        <Tooltip content={RamTooltip} />
        <ReferenceLine y={80} stroke="red" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="ramPct"
          stroke="#3b82f6"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── MetricsCharts (default export) ───────────────────────────────────────────

export default function MetricsCharts({ serverId }: { serverId: string }) {
  const { points, connected, error } = useMetricsStream(serverId);

  if (points.length === 0 && !connected) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Container gestoppt – keine Metriken
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">CPU</p>
          <CpuChart points={points} />
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">RAM</p>
          <RamChart points={points} />
        </div>
      </div>
    </div>
  );
}
