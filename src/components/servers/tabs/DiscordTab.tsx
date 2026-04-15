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
      toast.success("Discord configuration saved");
    } catch {
      toast.error("Failed to save Discord configuration");
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
      toast.success("Discord configuration removed");
    } catch {
      toast.error("Failed to remove configuration");
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
      toast.error("Could not create Discord invite. Make sure the bot has permission.");
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
        Loading Discord configuration…
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
              <h3 className="font-semibold">Discord Module not installed</h3>
              <p className="text-sm text-zinc-400 mt-1">
                The Discord integration module is not installed or not running. Ask your
                panel administrator to install the <strong>Discord Integration</strong> module
                from the module registry.
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

  const selectedGuild = guilds.find((g) => g.id === config.guildId);

  return (
    <div className="space-y-6">

      {/* ---- Bot Setup ---- */}
      <Card className="border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            Bot Setup
          </CardTitle>
          <CardDescription>
            Invite the Discord bot to your server, then link it below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            {botInviteUrl ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={botInviteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Invite Bot to Discord Server
                  </a>
                </Button>
                <span className="text-xs text-zinc-500">
                  (Requires Manage Server permission on the Discord side)
                </span>
              </>
            ) : (
              <p className="text-sm text-zinc-500">
                Bot invite URL unavailable — make sure the Discord module is running and{" "}
                <strong>DISCORD_CLIENT_ID</strong> is configured in the module settings.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Linked Discord Server</Label>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => loadData()}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </div>
            {guilds.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No Discord servers found. Invite the bot to your server first, then click Refresh.
              </p>
            ) : (
              <Select
                value={config.guildId ?? ""}
                onValueChange={selectGuild}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder="Select a Discord server…" />
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
              Create Server Invite Link
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ---- Channel Configuration ---- */}
      {config.guildId && (
        <>
          {/* Player Chat */}
          <ChannelConfigCard
            title="Player Chat"
            description="Relay vanilla Minecraft chat messages to a Discord channel."
            icon={<MessageCircle className="h-4 w-4" />}
            config={config.playerChat}
            channels={channels}
            channelsLoading={channelsLoading}
            onChange={(patch) => updateChannelConfig("playerChat", patch)}
            warning={
              <div className="flex items-start gap-2 rounded border border-yellow-700 bg-yellow-950/40 p-3">
                <TriangleAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-300">
                  Chat relay only works with <strong>default Minecraft chat formatting</strong>.
                  Plugins and mods that override chat format (e.g. EssentialsChat, ChatControl,
                  LuckPerms prefixes) may not be detected or may produce incorrect output.
                </p>
              </div>
            }
          />

          {/* Player Join/Leave */}
          <ChannelConfigCard
            title="Player Join / Leave"
            description="Post join and leave notifications to a Discord channel."
            icon={<Users className="h-4 w-4" />}
            config={config.playerEvents}
            channels={channels}
            channelsLoading={channelsLoading}
            onChange={(patch) => updateChannelConfig("playerEvents", patch)}
            warning={
              <div className="flex items-start gap-2 rounded border border-yellow-700 bg-yellow-950/40 p-3">
                <TriangleAlert className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-300">
                  Join/leave detection only works with <strong>default Minecraft join/leave formatting</strong>.
                  Plugins that override these messages (e.g. EssentialsX, CustomJoinMessages) may not be
                  detected or may produce incorrect output.
                </p>
              </div>
            }
          />

          {/* Whitelist Requests */}
          <ChannelConfigCard
            title="Whitelist Requests"
            description="When a player tries to join but isn't whitelisted, post a request with an approval button."
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
                  Whitelist request detection only works with <strong>default Minecraft connection-denied formatting</strong>.
                  Plugins that override these messages may not be detected or may produce incorrect output.
                </p>
              </div>
            }
          />

          {/* Server Events */}
          <ChannelConfigCard
            title="Server Events"
            description="Post notifications when the server starts, stops, crashes, or a backup completes."
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
                  Pending Whitelist Requests
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
              Save Configuration
            </Button>
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={handleRemove}>
              <Trash2 className="h-3 w-3 mr-1" />
              Remove
            </Button>
          </div>
        </>
      )}

      {/* ---- Invite URL Dialog ---- */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discord Invite Link</DialogTitle>
            <DialogDescription>
              Share this link with players so they can join your Discord server.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-zinc-900 rounded px-3 py-2 truncate">{inviteUrl}</code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { copyToClipboard(inviteUrl ?? ""); toast.success("Copied!"); }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <DialogFooter>
            <Button asChild>
              <a href={inviteUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 mr-1" />
                Open Link
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
              {config.enabled ? "Enabled" : "Disabled"}
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
            <Label className="text-xs">Target Channel</Label>
            {channelsLoading ? (
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading channels…
              </div>
            ) : channels.length === 0 ? (
              <p className="text-xs text-zinc-500">No channels found. Select a guild first.</p>
            ) : (
              <Select
                value={config.channelId ?? ""}
                onValueChange={(v) => onChange({ channelId: v || null })}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder="Select a channel…" />
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
                Required Discord Role ID{" "}
                <span className="text-zinc-500 font-normal">(optional — leave blank to allow everyone)</span>
              </Label>
              <input
                type="text"
                className="flex h-8 w-full max-w-sm rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm"
                placeholder="e.g. 123456789012345678"
                value={config.requiredRoleId ?? ""}
                onChange={(e) => onChange({ requiredRoleId: e.target.value || null })}
              />
              <p className="text-xs text-zinc-500">
                Right-click a role in Discord → Copy Role ID. Only members with this role can
                approve whitelist requests via the button.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
