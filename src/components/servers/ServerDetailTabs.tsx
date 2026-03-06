"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ServerOverviewTab } from "./ServerOverviewTab";
import { ServerConsoleTab } from "./ServerConsoleTab";
import { ServerLogsTab } from "./ServerLogsTab";
import { ServerPropertiesTab } from "./ServerPropertiesTab";
import { ServerFilesTab } from "./ServerFilesTab";
import { ServerAddonsTab } from "./ServerAddonsTab";
import { ServerBackupsTab } from "./ServerBackupsTab";
import { ServerAccessTab } from "./ServerAccessTab";
import { ServerSettingsTab } from "./ServerSettingsTab";

interface ServerPlain {
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
  javaArgs?: string;
  access: { userId: string; permissions: string[] }[];
  createdAt: string;
}

interface Props {
  server: ServerPlain;
  projectKey: string;
}

export function ServerDetailTabs({ server, projectKey }: Props) {
  const tabs = [
    { value: "overview", label: "Übersicht" },
    { value: "console", label: "Konsole" },
    { value: "logs", label: "Logs" },
    { value: "properties", label: "Eigenschaften" },
    { value: "files", label: "Dateien" },
    { value: "addons", label: "Mods/Plugins" },
    { value: "backups", label: "Backups" },
    { value: "access", label: "Zugriff" },
    { value: "settings", label: "Einstellungen" },
  ];

  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="mt-4">
        <TabsContent value="overview">
          <ServerOverviewTab server={server} />
        </TabsContent>
        <TabsContent value="console">
          <ServerConsoleTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="logs">
          <ServerLogsTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="properties">
          <ServerPropertiesTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="files">
          <ServerFilesTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="addons">
          <ServerAddonsTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="backups">
          <ServerBackupsTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="access">
          <ServerAccessTab serverId={server._id} access={server.access} />
        </TabsContent>
        <TabsContent value="settings">
          <ServerSettingsTab
            serverId={server._id}
            projectKey={projectKey}
            serverName={server.name}
            defaults={{
              memory: server.memory,
              port: server.port,
              rconPort: server.rconPort,
              version: server.version,
              modLoader: server.modLoader,
              javaArgs: server.javaArgs,
            }}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}
