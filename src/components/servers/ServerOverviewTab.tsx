"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Play, Square, RotateCcw } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  startServerAction,
  stopServerAction,
  recreateServerAction,
} from "@/app/(app)/actions/servers";

interface ServerData {
  _id: string;
  name: string;
  status: string;
  port: number;
  rconPort?: number;
  memory: number;
  version?: string;
  modLoader?: string;
  runtime: string;
  image: string;
  tag: string;
  containerId?: string;
  createdAt: string;
}

export function ServerOverviewTab({ server }: { server: ServerData }) {
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    startTransition(async () => {
      try {
        await startServerAction({ serverId: server._id });
        toast.success("Server wird gestartet");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  function handleStop() {
    startTransition(async () => {
      try {
        await stopServerAction({ serverId: server._id });
        toast.success("Server wird gestoppt");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  function handleRestart() {
    startTransition(async () => {
      try {
        await recreateServerAction({ serverId: server._id });
        toast.success("Server wird neu gestartet");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
      }
    });
  }

  const isRunning = server.status === "running";
  const isStopped = server.status === "stopped";

  const info = [
    { label: "Status", value: server.status },
    { label: "Runtime", value: server.runtime },
    { label: "Version", value: server.version ?? "latest" },
    { label: "Mod-Loader", value: server.modLoader ?? "vanilla" },
    { label: "Port", value: String(server.port) },
    { label: "RCON Port", value: server.rconPort ? String(server.rconPort) : "—" },
    { label: "RAM", value: `${server.memory} MB` },
    { label: "Image", value: `${server.image}:${server.tag}` },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleStart} disabled={isPending || !isStopped}>
          <Play className="mr-1.5 h-4 w-4" />
          Starten
        </Button>
        <Button
          variant="destructive"
          onClick={handleStop}
          disabled={isPending || !isRunning}
        >
          <Square className="mr-1.5 h-4 w-4" />
          Stoppen
        </Button>
        <Button
          variant="outline"
          onClick={handleRestart}
          disabled={isPending || isStopped}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Neustart
        </Button>
      </div>

      {/* Info Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {info.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-zinc-500">
                {item.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
