"use client";

import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function formatTs(v: number): string {
  try {
    return format(new Date(v), "HH:mm:ss");
  } catch {
    return "";
  }
}

// ── SystemMetricsCharts ───────────────────────────────────────────────────────

export default function SystemMetricsCharts() {
  const { points, connected } = useSystemMetrics();

  const latest = points[points.length - 1];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* CPU Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500">
              CPU-Auslastung
            </CardTitle>
            <span
              className={`text-2xl font-bold tabular-nums ${
                connected ? "" : "opacity-40"
              }`}
            >
              {latest !== undefined ? `${latest.cpuPct.toFixed(1)}%` : "—"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTs}
                tick={TICK_STYLE}
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} unit="%" tick={TICK_STYLE} width={38} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
                labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                itemStyle={{ color: "#818cf8" }}
                labelFormatter={(v) => formatTs(v as number)}
                formatter={(v) => [`${(v as number).toFixed(1)}%`, "CPU"]}
              />
              <Line
                type="monotone"
                dataKey="cpuPct"
                stroke="#818cf8"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* RAM Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-sm font-medium text-zinc-500">
              RAM-Auslastung
            </CardTitle>
            <div className="text-right">
              <span
                className={`text-2xl font-bold tabular-nums ${
                  connected ? "" : "opacity-40"
                }`}
              >
                {latest !== undefined ? `${latest.ramPct.toFixed(1)}%` : "—"}
              </span>
              {latest !== undefined && (
                <p className="text-xs text-zinc-500">
                  {latest.ramUsedMb.toLocaleString()} / {latest.ramTotalMb.toLocaleString()} MB
                </p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
              <XAxis
                dataKey="ts"
                tickFormatter={formatTs}
                tick={TICK_STYLE}
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} unit="%" tick={TICK_STYLE} width={38} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
                labelStyle={{ color: "#a1a1aa", fontSize: 11 }}
                itemStyle={{ color: "#34d399" }}
                labelFormatter={(v) => formatTs(v as number)}
                formatter={(v) => [`${(v as number).toFixed(1)}%`, "RAM"]}
              />
              <Line
                type="monotone"
                dataKey="ramPct"
                stroke="#34d399"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
