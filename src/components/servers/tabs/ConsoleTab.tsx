"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LogLine {
  stream: "stdout" | "stderr";
  message: string;
  timestamp?: string;
}

interface ConsoleTabProps {
  serverId: string;
  projectKey: string;
  serverStatus: string;
}

const POLL_INTERVAL_MS = 3000;
const HISTORY_KEY_PREFIX = "aethera:console-history:";
const HISTORY_MAX = 20;

// Lightweight severity classifier for a single console line.
type Severity = "error" | "warn" | "trace" | "normal";

function classifyLine(message: string, stream: "stdout" | "stderr"): Severity {
  // Stack-trace continuation lines ("    at ...", "Caused by:", "\t...").
  if (/^\s+(at\s|\.{3}|Caused by:)/.test(message)) return "trace";
  if (/\b(ERROR|SEVERE|FATAL|Exception)\b/.test(message) || stream === "stderr") return "error";
  if (/\bWARN(ING)?\b/.test(message)) return "warn";
  return "normal";
}

const SEVERITY_CLASS: Record<Severity, string> = {
  error: "text-destructive border-l-2 border-destructive/60 pl-2 -ml-2",
  warn: "text-warning",
  trace: "text-muted-foreground/70",
  normal: "text-zinc-200",
};

// Split a leading "[HH:MM:SS]" / "HH:MM:SS" timestamp so it can be dimmed.
function splitTimestamp(message: string): [string | null, string] {
  const m = message.match(/^(\[?\d{2}:\d{2}:\d{2}\]?)\s+([\s\S]*)$/);
  if (m) return [m[1], m[2]];
  return [null, message];
}

export function ConsoleTab({ serverId, serverStatus }: ConsoleTabProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  // -1 = editing a fresh command; >=0 = browsing history from the newest end.
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [sentFlash, setSentFlash] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isRunning = serverStatus === "running";
  const historyKey = `${HISTORY_KEY_PREFIX}${serverId}`;

  // Restore command history from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(historyKey);
      if (raw) setHistory(JSON.parse(raw) as string[]);
    } catch {
      // ignore unavailable/quota-exceeded storage
    }
  }, [historyKey]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/logs?lines=200`);
      if (!res.ok) return;
      const data: LogLine[] = await res.json();
      setLines(data);
    } catch {
      // silently ignore network errors during polling
    }
  }, [serverId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    loadLogs().finally(() => setLoading(false));
  }, [loadLogs]);

  // Polling when running
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(loadLogs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning, loadLogs]);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function pushHistory(cmd: string) {
    setHistory((prev) => {
      // Drop a duplicate of the immediately previous entry, cap at HISTORY_MAX.
      const deduped = prev[prev.length - 1] === cmd ? prev : [...prev, cmd];
      const next = deduped.slice(-HISTORY_MAX);
      try {
        localStorage.setItem(historyKey, JSON.stringify(next));
      } catch {
        // ignore unavailable/quota-exceeded storage
      }
      return next;
    });
  }

  // Browse the command history with ↑/↓ (newest at the end).
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setCommand(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      if (historyIdx === -1) return;
      e.preventDefault();
      const idx = historyIdx + 1;
      if (idx >= history.length) {
        setHistoryIdx(-1);
        setCommand("");
      } else {
        setHistoryIdx(idx);
        setCommand(history[idx] ?? "");
      }
    }
  }

  async function handleSend() {
    const cmd = command.trim();
    if (!cmd || !isRunning) return;
    setCommand("");
    setHistoryIdx(-1);
    pushHistory(cmd);
    try {
      const res = await fetch(`/api/servers/${serverId}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Befehl konnte nicht gesendet werden");
        return;
      }
      // Brief green border-flash to confirm the command was accepted.
      setSentFlash(true);
      setTimeout(() => setSentFlash(false), 350);
    } catch {
      toast.error("Netzwerkfehler beim Senden des Befehls");
    }
  }

  return (
    <div className="flex h-[600px] flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm text-zinc-500">
          <span className="relative flex h-2 w-2">
            {isRunning && (
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand opacity-75" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                isRunning ? "bg-brand" : "bg-muted-foreground",
              )}
            />
          </span>
          {lines.length} Zeilen
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            loadLogs().finally(() => setLoading(false));
          }}
          disabled={loading}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
          Logs laden
        </Button>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-sm"
      >
        {lines.length === 0 ? (
          <span className="text-zinc-500">
            {loading ? "Lade Logs…" : "Keine Logs verfügbar"}
          </span>
        ) : (
          lines.map((line, i) => {
            const severity = classifyLine(line.message, line.stream);
            const [ts, rest] = splitTimestamp(line.message);
            return (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all leading-5",
                  SEVERITY_CLASS[severity],
                )}
              >
                {ts && <span className="mr-2 text-zinc-600">{ts}</span>}
                {rest}
              </div>
            );
          })
        )}
      </div>

      {/* Command input */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <Input
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
            setHistoryIdx(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isRunning ? "Befehl eingeben…" : "Server muss laufen"
          }
          className={cn(
            "font-mono transition-colors duration-300",
            sentFlash && "border-brand ring-1 ring-brand",
          )}
          disabled={!isRunning}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!isRunning || !command.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
