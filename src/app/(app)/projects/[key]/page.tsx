import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getProject } from "@/lib/services/project.service";
import { listServers } from "@/lib/services/server.service";
import { listBlueprints } from "@/lib/services/blueprint.service";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, Play, Square } from "lucide-react";
import { BlueprintsList } from "@/components/projects/BlueprintsList";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { key } = await params;
  const session = await requireSession();

  const project = await getProject(key);
  if (!project) return notFound();

  const isOwner = project.owner.toString() === session.userId;
  const member = project.members.find(
    (m) => m.userId.toString() === session.userId,
  );
  const isAdmin = isOwner || member?.role === "admin";

  const [servers, blueprints] = await Promise.all([
    listServers(key, session.userId),
    listBlueprints(key, session.userId),
  ]);
  const running = servers.filter((s) => s.status === "running");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">Projekt</p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-zinc-400">
            Key: {project.key} · {servers.length} Server · {running.length}{" "}
            laufend
          </p>
        </div>
        {isAdmin && (
          <Link href={`/projects/${key}/servers/new`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Server erstellen
            </Button>
          </Link>
        )}
      </div>

      {/* Blueprints */}
      <BlueprintsList
        projectKey={key}
        blueprints={blueprints.map((b) => ({
          _id: b._id.toString(),
          name: b.name,
          maxRam: b.maxRam,
          status: b.status,
          serverId: b.serverId?.toString(),
        }))}
        isAdmin={!!isAdmin}
      />

      {/* Server-Liste */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Server</h2>
        {servers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-zinc-500">
              Noch keine Server in diesem Projekt.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <Link
                key={server._id.toString()}
                href={`/projects/${key}/servers/${server._id}`}
              >
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{server.name}</CardTitle>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                          server.status === "running"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {server.status === "running" ? (
                          <Play className="h-3 w-3" />
                        ) : (
                          <Square className="h-3 w-3" />
                        )}
                        {server.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-zinc-500 space-y-1">
                      <p>
                        {server.runtime} · {server.version ?? "latest"}
                      </p>
                      <p>
                        Port {server.port} · {server.memory} MB RAM
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
