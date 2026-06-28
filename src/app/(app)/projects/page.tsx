import { requireSession } from "@/lib/auth/guards";
import { listProjects } from "@/lib/services/project.service";
import { listServers } from "@/lib/services/server.service";
import { checkPermission } from "@/lib/services/permission-check";
import { FolderGit2 } from "lucide-react";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { EmptyState } from "@/components/ui/empty-state";
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
      <div className="flex animate-fade-in items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("projects.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length === 0
              ? t("projects.noProjectsDesc")
              : t("projects.subtitle", { count: projects.length })}
          </p>
        </div>
        <CreateProjectDialog canCreate={canCreate} />
      </div>

      {projectsWithServers.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="h-6 w-6" />}
          title={t("projects.noProjectsDesc")}
          description={t("dashboard.noProjectsHint")}
          action={<CreateProjectDialog canCreate={canCreate} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectsWithServers.map(({ project, servers }, i) => (
            <div
              key={project.key}
              className="animate-slide-up"
              style={{
                animationDelay: `${Math.min(i, 8) * 50}ms`,
                animationFillMode: "backwards",
              }}
            >
              <ProjectCard
                projectKey={project.key}
                name={project.name}
                servers={servers}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
