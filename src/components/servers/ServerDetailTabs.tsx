"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { ConsoleTab } from "./tabs/ConsoleTab";
import { ServerLogsTab } from "./ServerLogsTab";
import { PropertiesTab } from "./tabs/PropertiesTab";
import { ServerFilesTab } from "./ServerFilesTab";
import { ServerAddonsTab } from "./ServerAddonsTab";
import { ServerBackupsTab } from "./ServerBackupsTab";
import { ServerAccessTab } from "./ServerAccessTab";
import { SettingsTab } from "./tabs/SettingsTab";

interface ServerPlain {
  _id: string;
  name: string;
  identifier: string;
  status: string;
  runtime: string;
  version?: string;
  modLoader?: string;
  port: number;
  rconPort?: number;
  memory: number;
  image: string;
  tag: string;
  containerId?: string;
  containerStatus?: string;
  javaArgs?: string;
  autoStart: boolean;
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
          <OverviewTab server={server} projectKey={projectKey} />
        </TabsContent>
        <TabsContent value="console">
          <ConsoleTab
            serverId={server._id}
            projectKey={projectKey}
            serverStatus={server.status}
          />
        </TabsContent>
        <TabsContent value="logs">
          <ServerLogsTab serverId={server._id} />
        </TabsContent>
        <TabsContent value="properties">
          <PropertiesTab
            serverId={server._id}
            projectKey={projectKey}
            serverStatus={server.status}
          />
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
          <SettingsTab server={server} projectKey={projectKey} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
