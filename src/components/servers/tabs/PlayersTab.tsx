"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Plus, X, Loader2, ShieldCheck, ListChecks, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

interface WhitelistEntry {
  uuid: string;
  name: string;
}
interface OpEntry {
  uuid: string;
  name: string;
  level: number;
}
interface PlayersPayload {
  running: boolean;
  whitelist: WhitelistEntry[];
  ops: OpEntry[];
  whitelistEnabled: boolean;
}

interface PlayersTabProps {
  serverId: string;
  serverStatus: string;
  serverName?: string;
}

const USERNAME_RE = /^[A-Za-z0-9_]{1,16}$/;
/** Minecraft writes the JSON files asynchronously while running — refetch to reconcile. */
const RECONCILE_DELAY_MS = 700;

function avatarUrl(seed: string) {
  return `https://mc-heads.net/avatar/${seed}/32`;
}

/** Single avatar head with a graceful fallback when the CDN image fails to load. */
function Avatar({ seed }: { seed: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary text-xs font-bold uppercase text-muted-foreground"
        aria-hidden
      >
        {seed[0] ?? "?"}
      </div>
    );
  }
  return (
    // Plain <img> on purpose — avoids next/image remote-host config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(seed)}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 rounded"
      onError={() => setFailed(true)}
    />
  );
}

export function PlayersTab({ serverId, serverStatus }: PlayersTabProps) {
  const { t } = useLocale();

  const [data, setData] = useState<PlayersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Per-card request locks so buttons disable while in flight.
  const [whitelistBusy, setWhitelistBusy] = useState(false);
  const [opsBusy, setOpsBusy] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  // Add-row form state.
  const [whitelistName, setWhitelistName] = useState("");
  const [opName, setOpName] = useState("");
  const [opLevel, setOpLevel] = useState(4);

  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPlayers = useCallback(async (): Promise<PlayersPayload | null> => {
    const res = await fetch(`/api/servers/${serverId}/players`);
    if (!res.ok) throw new Error("load failed");
    return (await res.json()) as PlayersPayload;
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchPlayers()
      .then((payload) => {
        if (!cancelled && payload) setData(payload);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          toast.error(t("servers.players.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // t is stable across renders for a given locale; serverId drives reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId, fetchPlayers]);

  useEffect(() => {
    return () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    };
  }, []);

  const running = data?.running ?? serverStatus === "running";

  /** After a running mutation the re-read may briefly lag — reconcile shortly after. */
  function scheduleReconcile() {
    if (!running) return;
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => {
      fetchPlayers()
        .then((payload) => {
          if (payload) setData(payload);
        })
        .catch(() => {
          /* keep optimistic state on reconcile failure */
        });
    }, RECONCILE_DELAY_MS);
  }

  const whitelistValid = USERNAME_RE.test(whitelistName);
  const opValid = USERNAME_RE.test(opName);

  async function handleToggleWhitelist(next: boolean) {
    if (!data) return;
    const prev = data.whitelistEnabled;
    setData({ ...data, whitelistEnabled: next }); // optimistic
    setToggleBusy(true);
    try {
      const res = await fetch(
        `/api/servers/${serverId}/players/whitelist`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      if (!res.ok) throw new Error("toggle failed");
      const json = (await res.json()) as { whitelistEnabled: boolean };
      setData((d) => (d ? { ...d, whitelistEnabled: json.whitelistEnabled } : d));
    } catch {
      setData((d) => (d ? { ...d, whitelistEnabled: prev } : d)); // rollback
      toast.error(t("servers.players.actionError"));
    } finally {
      setToggleBusy(false);
    }
  }

  async function handleAddWhitelist() {
    if (!whitelistValid || whitelistBusy) return;
    const name = whitelistName;
    setWhitelistBusy(true);
    // Optimistic insert (uuid unknown yet — use name as avatar seed temporarily).
    setData((d) =>
      d ? { ...d, whitelist: [...d.whitelist, { uuid: name, name }] } : d,
    );
    try {
      const res = await fetch(
        `/api/servers/${serverId}/players/whitelist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      if (!res.ok) throw new Error("add failed");
      const json = (await res.json()) as PlayersPayload;
      setData(json);
      setWhitelistName("");
      toast.success(t("servers.players.added", { name }));
      scheduleReconcile();
    } catch {
      // rollback the optimistic insert
      setData((d) =>
        d
          ? { ...d, whitelist: d.whitelist.filter((e) => e.uuid !== name) }
          : d,
      );
      toast.error(t("servers.players.actionError"));
    } finally {
      setWhitelistBusy(false);
    }
  }

  async function handleRemoveWhitelist(entry: WhitelistEntry) {
    if (whitelistBusy) return;
    if (!window.confirm(t("servers.players.removeWhitelistConfirm", { name: entry.name }))) {
      return;
    }
    setWhitelistBusy(true);
    const snapshot = data;
    setData((d) =>
      d ? { ...d, whitelist: d.whitelist.filter((e) => e.uuid !== entry.uuid) } : d,
    );
    try {
      const res = await fetch(
        `/api/servers/${serverId}/players/whitelist/${encodeURIComponent(entry.name)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("remove failed");
      const json = (await res.json()) as PlayersPayload;
      setData(json);
      toast.success(t("servers.players.removed", { name: entry.name }));
      scheduleReconcile();
    } catch {
      if (snapshot) setData(snapshot); // rollback
      toast.error(t("servers.players.actionError"));
    } finally {
      setWhitelistBusy(false);
    }
  }

  async function handleAddOp() {
    if (!opValid || opsBusy) return;
    const name = opName;
    const level = opLevel;
    setOpsBusy(true);
    setData((d) =>
      d ? { ...d, ops: [...d.ops, { uuid: name, name, level }] } : d,
    );
    try {
      const res = await fetch(`/api/servers/${serverId}/players/ops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, level }),
      });
      if (!res.ok) throw new Error("add op failed");
      const json = (await res.json()) as PlayersPayload;
      setData(json);
      setOpName("");
      setOpLevel(4);
      toast.success(t("servers.players.added", { name }));
      // Vanilla can't set a per-player level live — note it applies after restart.
      if (running && level !== 4) {
        toast.info(t("servers.players.opLevelRestartNote"));
      }
      scheduleReconcile();
    } catch {
      setData((d) =>
        d ? { ...d, ops: d.ops.filter((e) => e.uuid !== name) } : d,
      );
      toast.error(t("servers.players.actionError"));
    } finally {
      setOpsBusy(false);
    }
  }

  async function handleRemoveOp(entry: OpEntry) {
    if (opsBusy) return;
    if (!window.confirm(t("servers.players.removeOpConfirm", { name: entry.name }))) {
      return;
    }
    setOpsBusy(true);
    const snapshot = data;
    setData((d) =>
      d ? { ...d, ops: d.ops.filter((e) => e.uuid !== entry.uuid) } : d,
    );
    try {
      const res = await fetch(
        `/api/servers/${serverId}/players/ops/${encodeURIComponent(entry.name)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("deop failed");
      const json = (await res.json()) as PlayersPayload;
      setData(json);
      toast.success(t("servers.players.removed", { name: entry.name }));
      scheduleReconcile();
    } catch {
      if (snapshot) setData(snapshot);
      toast.error(t("servers.players.actionError"));
    } finally {
      setOpsBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full rounded-md" />
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<Info className="h-6 w-6" />}
        title={t("servers.players.loadError")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Status note */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border p-3 text-sm",
          running
            ? "border-info/40 bg-info-muted text-info"
            : "border-border bg-secondary text-muted-foreground",
        )}
      >
        <Info className="h-4 w-4 shrink-0" />
        {running ? t("servers.players.liveNote") : t("servers.players.stoppedNote")}
      </div>

      {/* Whitelist card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4" />
            {t("servers.players.whitelist")}
          </CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("servers.players.enforceWhitelist")}
            <Switch
              aria-label={t("servers.players.enforceWhitelist")}
              checked={data.whitelistEnabled}
              disabled={toggleBusy}
              onCheckedChange={handleToggleWhitelist}
            />
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add row */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input
                aria-label={t("servers.players.username")}
                placeholder={t("servers.players.usernamePlaceholder")}
                value={whitelistName}
                maxLength={16}
                autoComplete="off"
                onChange={(e) => setWhitelistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && whitelistValid) {
                    e.preventDefault();
                    void handleAddWhitelist();
                  }
                }}
              />
              <Button
                onClick={() => void handleAddWhitelist()}
                disabled={!whitelistValid || whitelistBusy}
                size="sm"
                className="shrink-0"
              >
                {whitelistBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                {t("servers.players.addPlayer")}
              </Button>
            </div>
            {whitelistName.length > 0 && !whitelistValid && (
              <p className="text-xs text-red-500">
                {t("servers.players.invalidUsername")}
              </p>
            )}
          </div>

          {/* List */}
          {data.whitelist.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="h-6 w-6" />}
              title={t("servers.players.emptyWhitelist")}
            />
          ) : (
            <ul className="space-y-2">
              {data.whitelist.map((entry) => (
                <li
                  key={entry.uuid}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <Avatar seed={entry.uuid} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{entry.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {entry.uuid}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("servers.players.remove")}
                    disabled={whitelistBusy}
                    onClick={() => void handleRemoveWhitelist(entry)}
                  >
                    <X className="h-4 w-4 text-muted-foreground transition-colors hover:text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Operators card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {t("servers.players.operators")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add row */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                aria-label={t("servers.players.username")}
                placeholder={t("servers.players.usernamePlaceholder")}
                value={opName}
                maxLength={16}
                autoComplete="off"
                onChange={(e) => setOpName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && opValid) {
                    e.preventDefault();
                    void handleAddOp();
                  }
                }}
              />
              <select
                aria-label={t("servers.players.level")}
                value={opLevel}
                onChange={(e) => setOpLevel(Number(e.target.value))}
                className="h-10 shrink-0 rounded-md border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:ring-offset-zinc-950 dark:focus:ring-zinc-300"
              >
                {[1, 2, 3, 4].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {t("servers.players.level")} {lvl}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => void handleAddOp()}
                disabled={!opValid || opsBusy}
                size="sm"
                className="shrink-0"
              >
                {opsBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                {t("servers.players.addPlayer")}
              </Button>
            </div>
            {opName.length > 0 && !opValid && (
              <p className="text-xs text-red-500">
                {t("servers.players.invalidUsername")}
              </p>
            )}
          </div>

          {/* List */}
          {data.ops.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" />}
              title={t("servers.players.emptyOps")}
            />
          ) : (
            <ul className="space-y-2">
              {data.ops.map((entry) => (
                <li
                  key={entry.uuid}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                >
                  <Avatar seed={entry.uuid} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{entry.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {entry.uuid}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {t("servers.players.level")} {entry.level}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("servers.players.remove")}
                    disabled={opsBusy}
                    onClick={() => void handleRemoveOp(entry)}
                  >
                    <X className="h-4 w-4 text-muted-foreground transition-colors hover:text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
