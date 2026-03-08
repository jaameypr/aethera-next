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

export function ConsoleTab({ serverId, serverStatus }: ConsoleTabProps) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isRunning = serverStatus === "running";

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

  async function handleSend() {
    const cmd = command.trim();
    if (!cmd || !isRunning) return;
    setCommand("");
    try {
      const res = await fetch(`/api/servers/${serverId}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Befehl konnte nicht gesendet werden");
      }
    } catch {
      toast.error("Netzwerkfehler beim Senden des Befehls");
    }
  }

  return (
    <div className="flex h-[600px] flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">
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
          lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all leading-5",
                line.stream === "stderr"
                  ? "text-red-400"
                  : "text-zinc-200",
              )}
            >
              {line.message}
            </div>
          ))
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
          onChange={(e) => setCommand(e.target.value)}
          placeholder={
            isRunning ? "Befehl eingeben…" : "Server muss laufen"
          }
          className="font-mono"
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
