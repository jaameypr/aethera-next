import { requireSession } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import { listProjects } from "@/lib/services/project.service";
import { listServers } from "@/lib/services/server.service";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FolderKanban, Server, Users } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";

export default async function DashboardPage() {
  const session = await requireSession();
  const user = await getUserById(session.userId);

  const projects = await listProjects(session.userId);

  // Fetch servers per project in parallel
  const projectsWithServers = await Promise.all(
    projects.map(async (project) => {
      const servers = await listServers(project.key, session.userId);
      return { project, servers };
    }),
  );

  const totalServers = projectsWithServers.reduce(
    (sum, p) => sum + p.servers.length,
    0,
  );
  const runningServers = projectsWithServers.reduce(
    (sum, p) => sum + p.servers.filter((s) => s.status === "running").length,
    0,
  );
  const totalMembers = new Set(
    projects.flatMap((p) => [
      p.owner.toString(),
      ...p.members.map((m) => m.userId.toString()),
    ]),
  ).size;

  const stats = [
    {
      label: "Projekte",
      value: projects.length,
      icon: FolderKanban,
      description: `${projects.length} aktiv`,
    },
    {
      label: "Server",
      value: totalServers,
      icon: Server,
      description: `${runningServers} laufend`,
    },
    {
      label: "Mitglieder",
      value: totalMembers,
      icon: Users,
      description: "Aktive Nutzer",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Willkommen zurück, {user?.username || "User"}
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-500">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-zinc-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-zinc-500">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Projects Grid */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Deine Projekte
        </h2>
        {projectsWithServers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderKanban className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
              <p className="text-zinc-500 dark:text-zinc-400">
                Noch keine Projekte vorhanden. Erstelle dein erstes Projekt!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projectsWithServers.map(({ project, servers }) => (
              <ProjectCard
                key={project.key}
                projectKey={project.key}
                name={project.name}
                description={project.description}
                servers={servers.map((s) => ({
                  _id: s._id.toString(),
                  name: s.name,
                  status: s.status,
                }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
