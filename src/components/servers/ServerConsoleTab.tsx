"use client";

import { useState, useRef, useEffect } from "react";
import { useServerConsole } from "@/lib/hooks/use-server-console";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function ServerConsoleTab({ serverId }: { serverId: string }) {
  const { lines, sendCommand, connected, error, clear } =
    useServerConsole(serverId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines]);

  async function handleSend() {
    const cmd = input.trim();
    if (!cmd) return;
    setInput("");
    try {
      await sendCommand(cmd);
    } catch {
      // error handled by hook
    }
  }

  return (
    <div className="flex h-[600px] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-emerald-500" : "bg-zinc-400",
            )}
          />
          <span className="text-sm text-zinc-500">
            {connected ? "Verbunden" : "Getrennt"}
          </span>
          {error && (
            <span className="text-sm text-red-500">— {error}</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={clear}>
          Leeren
        </Button>
      </div>

      {/* Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-zinc-950 p-3 font-mono text-sm"
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-all",
              line.stream === "stderr" ? "text-red-400" : "text-zinc-200",
            )}
          >
            {line.message}
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        className="flex gap-2 border-t border-zinc-200 pt-2 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Befehl eingeben…"
          className="font-mono"
          disabled={!connected}
        />
        <Button type="submit" size="icon" disabled={!connected || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
