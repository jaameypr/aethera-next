"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { ConsoleTab } from "./tabs/ConsoleTab";
import { ServerLogsTab } from "./ServerLogsTab";

import { ServerFilesTab } from "./ServerFilesTab";
import { ServerAddonsTab } from "./ServerAddonsTab";
import { PackModsTab } from "./PackModsTab";
import { ServerBackupsTab } from "./ServerBackupsTab";
import { ServerAccessTab } from "./ServerAccessTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { ConfigurationTab } from "./tabs/ConfigurationTab";
import { DiscordTab } from "./tabs/DiscordTab";

interface ServerPlain {
  _id: string;
  name: string;
  identifier: string;
  status: string;
  runtime: string;
  version?: string;
  modLoader?: string;
  serverType?: string;
  port: number;
  rconPort?: number;
  memory: number;
  image: string;
  tag: string;
  containerId?: string;
  containerStatus?: string;
  javaArgs?: string;
  javaVersion?: string;
  autoStart: boolean;
  access: { userId: string; username: string; permissions: string[] }[];
  createdAt: string;
}

interface Props {
  server: ServerPlain;
  projectKey: string;
  isOwner: boolean;
  userPermissions: string[];
}

export function ServerDetailTabs({ server, projectKey, isOwner, userPermissions }: Props) {
  const can = (perm: string) => isOwner || userPermissions.includes(perm);

  const tabs = [
    { value: "overview",  label: "Übersicht",    show: true },
    { value: "console",   label: "Konsole",       show: can("server.console") },
    { value: "logs",      label: "Logs",          show: true },
    { value: "files",     label: "Dateien",       show: can("server.files") },
    { value: "addons",    label: "Mods/Plugins",  show: can("server.files") },
    { value: "backups",   label: "Backups",       show: can("server.backups") },
    { value: "config",    label: "Konfiguration", show: can("server.settings") },
    { value: "discord",   label: "Discord",       show: can("server.settings") },
    { value: "access",    label: "Zugriff",       show: can("server.settings") },
    { value: "settings",  label: "Einstellungen", show: can("server.settings") },
  ].filter((t) => t.show);

  const visibleValues = new Set(tabs.map((t) => t.value));
  const defaultTab = tabs[0]?.value ?? "overview";

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="flex flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="mt-4">
        {visibleValues.has("overview") && (
          <TabsContent value="overview">
            <OverviewTab server={server} projectKey={projectKey} />
          </TabsContent>
        )}
        {visibleValues.has("console") && (
          <TabsContent value="console">
            <ConsoleTab
              serverId={server._id}
              projectKey={projectKey}
              serverStatus={server.status}
            />
          </TabsContent>
        )}
        {visibleValues.has("logs") && (
          <TabsContent value="logs">
            <ServerLogsTab serverId={server._id} />
          </TabsContent>
        )}
        {visibleValues.has("files") && (
          <TabsContent value="files">
            <ServerFilesTab serverId={server._id} />
          </TabsContent>
        )}
        {visibleValues.has("addons") && (
          <TabsContent value="addons">
            {(server.serverType === "curseforge" || server.serverType === "modrinth") ? (
              <PackModsTab
                serverId={server._id}
                packType={server.serverType as "curseforge" | "modrinth"}
              />
            ) : (
              <ServerAddonsTab serverId={server._id} modLoader={server.modLoader ?? server.serverType} />
            )}
          </TabsContent>
        )}
        {visibleValues.has("backups") && (
          <TabsContent value="backups">
            <ServerBackupsTab serverId={server._id} serverName={server.name} />
          </TabsContent>
        )}
        {visibleValues.has("config") && (
          <TabsContent value="config">
            <ConfigurationTab serverId={server._id} serverStatus={server.status} />
          </TabsContent>
        )}
        {visibleValues.has("discord") && (
          <TabsContent value="discord">
            <DiscordTab serverId={server._id} />
          </TabsContent>
        )}
        {visibleValues.has("access") && (
          <TabsContent value="access">
            <ServerAccessTab serverId={server._id} access={server.access} />
          </TabsContent>
        )}
        {visibleValues.has("settings") && (
          <TabsContent value="settings">
            <SettingsTab server={server} projectKey={projectKey} />
          </TabsContent>
        )}
      </div>
    </Tabs>
  );
}
