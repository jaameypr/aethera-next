import { notFound } from "next/navigation";
import mongoose from "mongoose";
import { requireSession } from "@/lib/auth/guards";
import { getServer } from "@/lib/services/server.service";
import { canAccessServer, getServerUserContext } from "@/lib/services/server-access";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { ServerDetailTabs } from "@/components/servers/ServerDetailTabs";

interface Props {
  params: Promise<{ key: string; id: string }>;
}

export default async function ServerDetailPage({ params }: Props) {
  const { key, id } = await params;
  const session = await requireSession();

  if (!mongoose.isValidObjectId(id)) return notFound();

  const server = await getServer(id);
  if (!server || server.projectKey !== key) return notFound();

  // Gate: only project members (any role) or explicitly-granted users may view the page.
  if (!(await canAccessServer(server, session.userId))) return notFound();

  const { isOwner, permissions: userPermissions } = await getServerUserContext(
    server,
    session.userId,
  );

  const canSettings = isOwner || userPermissions.includes("server.settings");

  // Resolve usernames for access entries — only expose to users with settings permission.
  let resolvedAccess: { userId: string; username: string; permissions: string[] }[] = [];
  if (canSettings && server.access?.length) {
    await connectDB();
    const userIds = server.access.map((a) => a.userId.toString());
    const users = await UserModel.find({ _id: { $in: userIds } })
      .select("_id username")
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u.username as string]));
    resolvedAccess = server.access.map((a) => ({
      userId: a.userId.toString(),
      username: userMap.get(a.userId.toString()) ?? a.userId.toString(),
      permissions: a.permissions,
    }));
  }

  // Sanitized DTO — never serialize env or properties (may contain secrets).
  const plain = {
    _id: server._id.toString(),
    name: server.name,
    projectKey: server.projectKey,
    identifier: server.identifier,
    status: server.status,
    runtime: server.runtime,
    version: server.version,
    modLoader: server.modLoader,
    serverType: server.serverType,
    port: server.port,
    rconPort: server.rconPort,
    memory: server.memory,
    image: server.image,
    tag: server.tag,
    containerId: server.containerId,
    containerStatus: server.containerStatus,
    javaArgs: server.javaArgs,
    javaVersion: server.javaVersion,
    autoStart: server.autoStart,
    createdAt: server.createdAt.toISOString(),
    access: resolvedAccess,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{plain.name}</h1>
        <p className="text-sm text-zinc-500">
          {plain.runtime} · {plain.identifier} · Port {plain.port}
        </p>
      </div>

      <ServerDetailTabs
        server={plain}
        projectKey={key}
        isOwner={isOwner}
        userPermissions={userPermissions}
      />
    </div>
  );
}
