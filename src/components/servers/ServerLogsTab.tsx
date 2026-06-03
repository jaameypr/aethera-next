"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowDown } from "lucide-react";
import { useServerLogs } from "@/lib/hooks/use-server-logs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

type StreamFilter = "all" | "stdout" | "stderr";

// Severity coloring for a single log line.
type Severity = "error" | "warn" | "trace" | "normal";

function classifyLine(message: string, stream: "stdout" | "stderr"): Severity {
  if (/^\s+(at\s|\.{3}|Caused by:)/.test(message)) return "trace";
  if (/\b(ERROR|SEVERE|FATAL|Exception)\b/.test(message) || stream === "stderr") return "error";
  if (/\bWARN(ING)?\b/.test(message)) return "warn";
  return "normal";
}

const SEVERITY_CLASS: Record<Severity, string> = {
  error: "text-destructive",
  warn: "text-warning",
  trace: "text-muted-foreground/70",
  normal: "text-zinc-300",
};

export function ServerLogsTab({ serverId }: { serverId: string }) {
  const { t } = useLocale();
  const { logs, connected, error, clear } = useServerLogs(serverId);
  const [filter, setFilter] = useState<StreamFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered =
    filter === "all" ? logs : logs.filter((l) => l.stream === filter);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [filtered, autoScroll]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  }

  const filters: { label: string; value: StreamFilter }[] = [
    { label: t("servers.logs.filterAll"), value: "all" },
    { label: "stdout", value: "stdout" },
    { label: "stderr", value: "stderr" },
  ];

  return (
    <div className="flex h-[600px] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                connected ? "bg-brand" : "bg-muted-foreground",
              )}
            />
          </span>
          <span className="text-sm text-zinc-500">
            {t("servers.logs.lines", { count: filtered.length })}
          </span>
          {autoScroll && connected && (
            <span className="text-xs font-medium text-brand">Following</span>
          )}
          {error && <span className="text-sm text-red-500">— {error}</span>}
        </div>
        <div className="flex items-center gap-2">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={clear}>
            {t("servers.logs.clear")}
          </Button>
        </div>
      </div>

      {/* Log output */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-zinc-950 p-3 font-mono text-xs leading-5"
        >
          {filtered.map((entry, i) => {
            const severity = classifyLine(entry.message, entry.stream);
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  SEVERITY_CLASS[severity],
                  severity === "error" && "border-l-2 border-destructive/60 pl-2 -ml-1",
                )}
              >
                <span className="mr-2 text-zinc-600">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                {entry.message}
              </div>
            );
          })}
        </div>

        {/* Floating scroll-to-bottom button — only when scrolled up off the tail. */}
        {!autoScroll && (
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
            }}
            className="absolute bottom-3 right-3 inline-flex animate-slide-up items-center gap-1.5 rounded-full border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-z3 transition-transform hover:-translate-y-0.5"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            {t("servers.logs.scrollToBottom")}
          </button>
        )}
      </div>
    </div>
  );
}
