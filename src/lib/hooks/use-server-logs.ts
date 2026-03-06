"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface LogEntry {
  stream: "stdout" | "stderr";
  message: string;
  timestamp: string;
}

interface UseServerLogsOptions {
  enabled?: boolean;
  maxLines?: number;
  reconnectDelay?: number;
}

interface UseServerLogsResult {
  logs: LogEntry[];
  connected: boolean;
  error: string | null;
  clear: () => void;
}

export function useServerLogs(
  serverId: string | null,
  options: UseServerLogsOptions = {},
): UseServerLogsResult {
  const { enabled = true, maxLines = 1000, reconnectDelay = 3000 } = options;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => setLogs([]), []);

  useEffect(() => {
    if (!serverId || !enabled) {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    function connect() {
      const es = new EventSource(`/api/servers/${serverId}/logs/stream`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs((prev) => {
            const next = [...prev, entry];
            return next.length > maxLines ? next.slice(-maxLines) : next;
          });
        } catch {
          // ignore malformed messages
        }
      };

      es.addEventListener("error", (event) => {
        // SSE spec: error event fires on connection loss
        if (es.readyState === EventSource.CLOSED) {
          setConnected(false);
          setError("Connection closed");
          scheduleReconnect();
        } else if (es.readyState === EventSource.CONNECTING) {
          setConnected(false);
        }

        // Custom error event from server
        const messageEvent = event as MessageEvent;
        if (messageEvent.data) {
          try {
            const { error: errMsg } = JSON.parse(messageEvent.data);
            setError(errMsg);
          } catch { /* ignore */ }
        }
      });

      es.addEventListener("end", () => {
        setConnected(false);
        es.close();
      });
    }

    function scheduleReconnect() {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        if (esRef.current?.readyState === EventSource.CLOSED) {
          connect();
        }
      }, reconnectDelay);
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      setConnected(false);
    };
  }, [serverId, enabled, maxLines, reconnectDelay]);

  return { logs, connected, error, clear };
}
