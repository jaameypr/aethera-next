"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Bot,
  Loader2,
  TriangleAlert,
  Copy,
  Users,
  Bell,
  ShieldCheck,
  Save,
  Trash2,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// (no alert component — using inline warning div)
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { copyToClipboard } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Guild {
  id: string;
  name: string;
  iconUrl?: string;
}

interface Channel {
  id: string;
  name: string;
}

interface ChannelConfig {
  enabled: boolean;
  channelId: string | null;
  requiredRoleId?: string | null;
}

interface ServerDiscordConfig {
  guildId: string | null;
  guildName: string | null;
  playerChat: ChannelConfig;
  playerEvents: ChannelConfig;
  whitelistRequests: ChannelConfig;
  serverEvents: ChannelConfig;
}

interface WhitelistRequest {
  id: string;
  playerName: string;
  playerUuid?: string;
  skinUrl?: string;
  createdAt: string;
  processed: boolean;
}

const EMPTY_CHANNEL_CONFIG: ChannelConfig = { enabled: false, channelId: null, requiredRoleId: null };

const EMPTY_CONFIG: ServerDiscordConfig = {
  guildId: null,
  guildName: null,
  playerChat: { ...EMPTY_CHANNEL_CONFIG },
  playerEvents: { ...EMPTY_CHANNEL_CONFIG },
  whitelistRequests: { ...EMPTY_CHANNEL_CONFIG },
  serverEvents: { ...EMPTY_CHANNEL_CONFIG },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  serverId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiscordTab({ serverId }: Props) {
  const { t } = useLocale();

  const [moduleAvailable, setModuleAvailable] = useState<boolean | null>(null);
  const [config, setConfig]       = useState<ServerDiscordConfig>(EMPTY_CONFIG);
  const [guilds, setGuilds]       = useState<Guild[]>([]);
  const [botInviteUrl, setBotInviteUrl] = useState<string>("");
  const [channels, setChannels]   = useState<Channel[]>([]);
  const [requests, setRequests]   = useState<WhitelistRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  // -------------------------------------------------------------------------
  // Load initial data
  // -------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, guildsRes] = await Promise.all([
        fetch(`/api/servers/${serverId}/discord`),
        fetch(`/api/servers/${serverId}/discord/guilds`),
      ]);

      if (configRes.status === 503 || guildsRes.status === 503) {
        setModuleAvailable(false);
        return;
      }

      setModuleAvailable(true);

      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data ? { ...EMPTY_CONFIG, ...data } : EMPTY_CONFIG);
      }

      if (guildsRes.ok) {
        const data = await guildsRes.json();
        setGuilds(data.guilds ?? []);
        setBotInviteUrl(data.botInviteUrl ?? "");
      }
    } catch {
      setModuleAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { loadData(); }, [loadData]);

  // -------------------------------------------------------------------------
  // Load channels when guild changes
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!config.guildId) {
      setChannels([]);
      return;
    }

    const fetchChannels = async () => {
      setChannelsLoading(true);
      try {
        const res = await fetch(`/api/servers/${serverId}/discord/channels/${config.guildId}`);
        if (res.ok) {
          const data = await res.json();
          setChannels(data ?? []);
        }
      } finally {
        setChannelsLoading(false);
      }
    };
    fetchChannels();
  }, [config.guildId, serverId]);

  // -------------------------------------------------------------------------
  // Load pending whitelist requests
  // -------------------------------------------------------------------------

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/discord/whitelist-requests`);
      if (res.ok) setRequests(await res.json());
    } catch { /* silently ignore */ }
  }, [serverId]);

  useEffect(() => {
    if (config.whitelistRequests?.enabled) loadRequests();
  }, [config.whitelistRequests?.enabled, loadRequests]);

  // -------------------------------------------------------------------------
  // Save config
  // -------------------------------------------------------------------------

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/discord`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(t("servers.discord.configSaved"));
    } catch {
      toast.error(t("servers.discord.configSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Remove config
  // -------------------------------------------------------------------------

  const handleRemove = async () => {
    try {
      await fetch(`/api/servers/${serverId}/discord`, { method: "DELETE" });
      setConfig(EMPTY_CONFIG);
      setChannels([]);
      toast.success(t("servers.discord.configRemoved"));
    } catch {
      toast.error(t("servers.discord.configRemoveFailed"));
    }
  };

  // -------------------------------------------------------------------------
  // Create invite
  // -------------------------------------------------------------------------

  const handleCreateInvite = async () => {
    if (!config.guildId) return;
    try {
      const res = await fetch(`/api/servers/${serverId}/discord/invite/${config.guildId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create invite");
      const data = await res.json();
      setInviteUrl(data.url);
      setShowInviteDialog(true);
    } catch {
      toast.error(t("servers.discord.inviteCreateFailed"));
    }
  };

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function updateChannelConfig(
    key: keyof Pick<ServerDiscordConfig, "playerChat" | "playerEvents" | "whitelistRequests" | "serverEvents">,
    patch: Partial<ChannelConfig>,
  ) {
    setConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  }

  function selectGuild(guildId: string) {
    const guild = guilds.find((g) => g.id === guildId);
    setConfig((prev) => ({
      ...prev,
      guildId,
      guildName: guild?.name ?? null,
      playerChat:        { ...prev.playerChat,        channelId: null },
      playerEvents:      { ...prev.playerEvents,      channelId: null },
      whitelistRequests: { ...prev.whitelistRequests, channelId: null },
      serverEvents:      { ...prev.serverEvents,      channelId: null },
    }));
  }

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("servers.discord.loading")}
      </div>
    );
  }

  if (moduleAvailable === false) {
    return (
      <Card className="border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <MessageCircle className="h-8 w-8 text-zinc-400 mt-1 shrink-0" />
            <div>
              <h3 className="font-semibold">{t("servers.discord.notInstalled")}</h3>
              <p className="text-sm text-zinc-400 mt-1">
                {t("servers.discord.notInstalledDesc")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Main UI
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">

      {/* ---- Bot Setup ---- */}
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            {t("servers.discord.botSetup")}
          </CardTitle>
          <CardDescription>
            {t("servers.discord.botSetupDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {botInviteUrl ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {t("servers.discord.inviteBot")}
                  </a>
                </Button>
                <span className="text-xs text-zinc-500">
                  {t("servers.discord.inviteRequires")}
                </span>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                {t("servers.discord.inviteUnavailable")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>{t("servers.discord.linkedServer")}</Label>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => loadData()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                {t("servers.discord.refresh")}
              </Button>
            </div>
            {guilds.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {t("servers.discord.noGuilds")}
              </p>
            ) : (
              <Select
                value={config.guildId ?? ""}
                onValueChange={selectGuild}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={t("servers.discord.selectGuild")} />
                </SelectTrigger>
                <SelectContent>
                  {guilds.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {config.guildId && (
            <Button variant="outline" size="sm" onClick={handleCreateInvite}>
              <ExternalLink className="h-3 w-3 mr-1" />
              {t("servers.discord.createInvite")}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ---- Channel Configuration ---- */}
      {config.guildId && (
        <>
          {/* Player Chat */}
          <ChannelConfigCard
            title={t("servers.discord.playerChat")}
            description={t("servers.discord.playerChatDesc")}
            icon={<MessageCircle className="h-4 w-4" />}
            config={config.playerChat}
            channels={channels}
            channelsLoading={channelsLoading}
            onChange={(patch) => updateChannelConfig("playerChat", patch)}
            warning={
              <div className="flex items-start gap-2 rounded border border-yellow-700 bg-yellow-950/40 p-3">
                <TriangleAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-300">
                  {t("servers.discord.playerChatWarning")}
                </p>
              </div>
            }
          />

          {/* Player Join/Leave */}
          <ChannelConfigCard
            title={t("servers.discord.playerEvents")}
            description={t("servers.discord.playerEventsDesc")}
            icon={<Users className="h-4 w-4" />}
            config={config.playerEvents}
            channels={channels}
            channelsLoading={channelsLoading}
            onChange={(patch) => updateChannelConfig("playerEvents", patch)}
            warning={
              <div className="flex items-start gap-2 rounded border border-yellow-700 bg-yellow-950/40 p-3">
                <TriangleAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-300">
                  {t("servers.discord.playerEventsWarning")}
                </p>
              </div>
            }
          />

          {/* Whitelist Requests */}
          <ChannelConfigCard
            title={t("servers.discord.whitelistRequests")}
            description={t("servers.discord.whitelistRequestsDesc")}
            icon={<ShieldCheck className="h-4 w-4" />}
            config={config.whitelistRequests}
            channels={channels}
            channelsLoading={channelsLoading}
            onChange={(patch) => updateChannelConfig("whitelistRequests", patch)}
            showRoleField
            warning={
              <div className="flex items-start gap-2 rounded border border-yellow-700 bg-yellow-950/40 p-3">
                <TriangleAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-300">
                  {t("servers.discord.whitelistWarning")}
                </p>
              </div>
            }
          />

          {/* Server Events */}
          <ChannelConfigCard
            title={t("servers.discord.serverEvents")}
            description={t("servers.discord.serverEventsDesc")}
            icon={<Activity className="h-4 w-4" />}
            config={config.serverEvents}
            channels={channels}
            channelsLoading={channelsLoading}
            onChange={(patch) => updateChannelConfig("serverEvents", patch)}
          />

          {/* Pending Requests */}
          {config.whitelistRequests.enabled && requests.length > 0 && (
            <Card className="border-zinc-800">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  {t("servers.discord.pendingRequests")}
                  <Badge variant="secondary">{requests.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {requests.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-2 rounded border border-zinc-800 bg-zinc-900/50">
                      {r.skinUrl && (
                        <img src={r.skinUrl} alt={r.playerName} className="w-8 h-8 rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{r.playerName}</p>
                        {r.playerUuid && (
                          <p className="text-xs text-zinc-500 truncate">{r.playerUuid}</p>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save / Remove actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              {t("servers.discord.saveConfig")}
            </Button>
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={handleRemove}>
              <Trash2 className="h-3 w-3 mr-1" />
              {t("servers.discord.remove")}
            </Button>
          </div>
        </>
      )}

      {/* ---- Invite URL Dialog ---- */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("servers.discord.inviteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("servers.discord.inviteDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-zinc-900 rounded px-3 py-2 truncate">{inviteUrl}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { copyToClipboard(inviteUrl ?? ""); toast.success(t("servers.discord.copied")); }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <DialogFooter>
            <Button asChild>
              <a href={inviteUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" />
                {t("servers.discord.openLink")}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel config card sub-component
// ---------------------------------------------------------------------------

interface ChannelConfigCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  config: ChannelConfig;
  channels: Channel[];
  channelsLoading: boolean;
  onChange: (patch: Partial<ChannelConfig>) => void;
  warning?: React.ReactNode;
  showRoleField?: boolean;
}

function ChannelConfigCard({
  title,
  description,
  icon,
  config,
  channels,
  channelsLoading,
  onChange,
  warning,
  showRoleField,
}: ChannelConfigCardProps) {
  const { t } = useLocale();

  return (
    <Card className="border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            {icon}
            {title}
          </span>
          <div className="flex items-center gap-2">
            <Label htmlFor={`toggle-${title}`} className="text-xs text-zinc-400 font-normal">
              {config.enabled ? t("servers.discord.enabledLabel") : t("servers.discord.disabledLabel")}
            </Label>
            <Switch
              id={`toggle-${title}`}
              checked={config.enabled}
              onCheckedChange={(checked) => onChange({ enabled: checked })}
            />
          </div>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      {config.enabled && (
        <CardContent className="space-y-3">
          {warning}

          <div className="space-y-1.5">
            <Label className="text-xs">{t("servers.discord.targetChannel")}</Label>
            {channelsLoading ? (
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("servers.discord.loadingChannels")}
              </div>
            ) : channels.length === 0 ? (
              <p className="text-xs text-zinc-500">{t("servers.discord.noChannels")}</p>
            ) : (
              <Select
                value={config.channelId ?? ""}
                onValueChange={(v) => onChange({ channelId: v || null })}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder={t("servers.discord.selectChannel")} />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      # {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {showRoleField && (
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("servers.discord.roleIdLabel")}{" "}
                <span className="text-zinc-500 font-normal">{t("servers.discord.roleIdOptional")}</span>
              </Label>
              <input
                type="text"
                className="flex h-8 w-full max-w-sm rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm"
                placeholder={t("servers.discord.roleIdPlaceholder")}
                value={config.requiredRoleId ?? ""}
                onChange={(e) => onChange({ requiredRoleId: e.target.value || null })}
              />
              <p className="text-xs text-zinc-500">
                {t("servers.discord.roleIdHelper")}
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
