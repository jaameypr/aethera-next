import { requireSession } from "@/lib/auth/guards";
import { listProjects } from "@/lib/services/project.service";
import { listServers } from "@/lib/services/server.service";
import { checkPermission } from "@/lib/services/permission-check";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { getServerT } from "@/lib/i18n/server";

export default async function ProjectsPage() {
  const session = await requireSession();
  const { t } = await getServerT();
  const [projects, canCreate] = await Promise.all([
    listProjects(session.userId),
    checkPermission(session.userId, "projects.create"),
  ]);

  const projectsWithServers = await Promise.all(
    projects.map(async (project) => {
      const servers = await listServers(project.key, session.userId);
      return {
        project,
        servers: servers.map((s) => ({
          _id: s._id.toString(),
          name: s.name,
          status: s.status,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("projects.title")}</h1>
          <p className="text-sm text-zinc-500">
            {projects.length === 0
              ? t("projects.noProjectsDesc")
              : t("projects.subtitle", { count: projects.length })}
          </p>
        </div>
        <CreateProjectDialog canCreate={canCreate} />
      </div>

      {projectsWithServers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 py-16 text-center text-zinc-500 dark:text-zinc-400">
          <p className="text-sm">{t("dashboard.noProjectsHint")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectsWithServers.map(({ project, servers }) => (
            <ProjectCard
              key={project.key}
              projectKey={project.key}
              name={project.name}
              servers={servers}
            />
          ))}
        </div>
      )}
    </div>
  );
}
