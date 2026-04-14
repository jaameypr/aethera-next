import { requireSession } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import { listProjects } from "@/lib/services/project.service";
import { listServers } from "@/lib/services/server.service";
import { checkPermission } from "@/lib/services/permission-check";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FolderKanban, Server, Users } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { getServerT } from "@/lib/i18n/server";

export default async function DashboardPage() {
  const session = await requireSession();
  const { t } = await getServerT();
  const [user, projects, canCreate] = await Promise.all([
    getUserById(session.userId),
    listProjects(session.userId),
    checkPermission(session.userId, "projects.create"),
  ]);

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
      label: t("dashboard.stats.projects"),
      value: projects.length,
      icon: FolderKanban,
      description: t("dashboard.stats.projectsDesc", { count: projects.length }),
    },
    {
      label: t("dashboard.stats.servers"),
      value: totalServers,
      icon: Server,
      description: t("dashboard.stats.serversDesc", { count: runningServers }),
    },
    {
      label: t("dashboard.stats.members"),
      value: totalMembers,
      icon: Users,
      description: t("dashboard.stats.membersDesc"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t("dashboard.title")}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            {t("dashboard.welcome", { username: user?.username ?? "User" })}
          </p>
        </div>
        <CreateProjectDialog canCreate={canCreate} />
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
          {t("dashboard.yourProjects")}
        </h2>
        {projectsWithServers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderKanban className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
              <p className="text-zinc-500 dark:text-zinc-400">
                {t("dashboard.noProjects")}
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
