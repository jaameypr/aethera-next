"use client";

import { useState, useRef, useEffect } from "react";
import { useServerLogs } from "@/lib/hooks/use-server-logs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StreamFilter = "all" | "stdout" | "stderr";

export function ServerLogsTab({ serverId }: { serverId: string }) {
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
    { label: "Alle", value: "all" },
    { label: "stdout", value: "stdout" },
    { label: "stderr", value: "stderr" },
  ];

  return (
    <div className="flex h-[600px] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-emerald-500" : "bg-zinc-400",
            )}
          />
          <span className="text-sm text-zinc-500">
            {filtered.length} Zeilen
          </span>
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
            Leeren
          </Button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-zinc-950 p-3 font-mono text-xs leading-5"
      >
        {filtered.map((entry, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-all",
              entry.stream === "stderr" ? "text-red-400" : "text-zinc-300",
            )}
          >
            <span className="mr-2 text-zinc-600">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
            {entry.message}
          </div>
        ))}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          className="border-t border-zinc-800 bg-zinc-900 py-1 text-center text-xs text-zinc-400 hover:text-zinc-200"
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
          }}
        >
          ↓ Zum Ende scrollen
        </button>
      )}
    </div>
  );
}
