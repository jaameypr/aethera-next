import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getProject, getMembersWithUsernames } from "@/lib/services/project.service";
import { listServers } from "@/lib/services/server.service";
import { listBlueprints } from "@/lib/services/blueprint.service";
import { UserModel } from "@/lib/db/models/user";
import { connectDB } from "@/lib/db/connection";
import { ProjectServerSection } from "@/components/projects/ProjectServerSection";
import { ProjectMembersPanel } from "@/components/projects/ProjectMembersPanel";
import { DeleteProjectSection } from "@/components/projects/DeleteProjectSection";
import { getServerT } from "@/lib/i18n/server";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { key } = await params;
  const session = await requireSession();
  const { t } = await getServerT();

  const project = await getProject(key);
  if (!project) return notFound();

  const isOwner = project.owner.toString() === session.userId;
  const member = project.members.find(
    (m) => m.userId.toString() === session.userId,
  );
  const isAdmin = isOwner || member?.role === "admin";

  const [servers, blueprints, membersData] = await Promise.all([
    listServers(key, session.userId),
    listBlueprints(key, session.userId),
    getMembersWithUsernames(key),
  ]);

  await connectDB();
  const ownerUser = await UserModel.findById(project.owner).select("username").lean();
  const ownerUsername = (ownerUser as { username?: string } | null)?.username ?? t("common.unknown");
  const running = servers.filter((s) => s.status === "running");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-zinc-500">{t("projects.detail.projectLabel")}</p>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-zinc-400">
          {project.key} · {t("projects.detail.serversRunning", {
            servers: servers.length,
            running: running.length,
          })}
        </p>
      </div>

      {/* Main grid: servers (3/4) + members sidebar (1/4) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_440px]">
        {/* Left: servers + blueprints */}
        <ProjectServerSection
          projectKey={key}
          servers={servers.map((s) => ({
            _id: s._id.toString(),
            name: s.name,
            status: s.status,
            runtime: s.runtime,
            version: s.version ?? undefined,
            port: s.port,
            memory: s.memory,
          }))}
          blueprints={blueprints.map((b) => ({
            _id: b._id.toString(),
            name: b.name,
            maxRam: b.maxRam,
            status: b.status,
            serverId: b.serverId?.toString(),
          }))}
          isAdmin={!!isAdmin}
        />

        {/* Right: members sidebar */}
        <aside>
          <ProjectMembersPanel
            projectKey={key}
            ownerUsername={ownerUsername}
            members={membersData}
            isAdmin={!!isAdmin}
          />
        </aside>
      </div>

      {/* Danger zone — owner only */}
      {isOwner && (
        <DeleteProjectSection
          projectKey={key}
          projectName={project.name}
          serverCount={servers.length}
        />
      )}
    </div>
  );
}
