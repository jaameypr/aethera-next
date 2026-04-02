import "server-only";

import { connectDB } from "@/lib/db/connection";
import { ProjectModel, type IProject } from "@/lib/db/models/project";
import { ServerModel } from "@/lib/db/models/server";
import { BackupModel } from "@/lib/db/models/backup";
import {
  ProjectLogModel,
  type IProjectLog,
  type ProjectLogAction,
} from "@/lib/db/models/project-log";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { UserModel } from "@/lib/db/models/user";
import { RoleModel } from "@/lib/db/models/role";
import { grantIfAbsent } from "@/lib/services/permission-grant.service";

const KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Role → server permission presets
// ---------------------------------------------------------------------------

export type ProjectMemberRole = "admin" | "manager" | "viewer" | "member";

export const ROLE_SERVER_PERMISSIONS: Record<ProjectMemberRole, string[]> = {
  admin:   ["server.start", "server.stop", "server.console", "server.files", "server.backups", "server.settings"],
  manager: ["server.start", "server.stop", "server.console", "server.files", "server.backups"],
  member:  ["server.start", "server.stop", "server.console", "server.files", "server.backups"], // same as manager
  viewer:  [],
};

/** Auto-grant server-level permissions across all servers in a project for a given role. */
async function grantServerPermissionsForRole(
  projectKey: string,
  userId: string,
  role: ProjectMemberRole,
): Promise<void> {
  const perms = ROLE_SERVER_PERMISSIONS[role] ?? [];
  if (perms.length === 0) return;

  const servers = await ServerModel.find({ projectKey }).select("_id").lean();
  for (const server of servers) {
    const sid = server._id.toString();
    const existing = await ServerModel.findOne({ _id: sid, "access.userId": userId });
    if (existing) {
      await ServerModel.updateOne(
        { _id: sid, "access.userId": userId },
        { $set: { "access.$.permissions": perms } },
      );
    } else {
      await ServerModel.updateOne(
        { _id: sid },
        { $push: { access: { userId, permissions: perms } } },
      );
    }
  }
}

/** Remove a user's server-level access from all servers in a project. */
async function revokeServerPermissionsForProject(
  projectKey: string,
  userId: string,
): Promise<void> {
  await ServerModel.updateMany(
    { projectKey },
    { $pull: { access: { userId } } },
  );
}


// ---------------------------------------------------------------------------

export async function listProjects(userId: string): Promise<IProject[]> {
  await connectDB();
  return ProjectModel.find({
    $or: [{ owner: userId }, { "members.userId": userId }],
  })
    .sort({ name: 1 })
    .lean<IProject[]>();
}

export async function getProject(key: string): Promise<IProject | null> {
  await connectDB();
  return ProjectModel.findOne({ key }).lean<IProject>();
}

export interface MemberWithUsername {
  userId: string;
  username: string;
  role: ProjectMemberRole;
  serverAccess: { serverId: string; serverName: string; permissions: string[] }[];
}

export async function getMembersWithUsernames(
  projectKey: string,
): Promise<MemberWithUsername[]> {
  await connectDB();

  const project = await ProjectModel.findOne({ key: projectKey }).lean<IProject>();
  if (!project || project.members.length === 0) return [];

  const memberIds = project.members.map((m) => m.userId.toString());

  const [users, servers] = await Promise.all([
    UserModel.find({ _id: { $in: memberIds } }).select("_id username").lean(),
    ServerModel.find({ projectKey }).select("_id name access").lean(),
  ]);

  const usernameMap = new Map(users.map((u) => [u._id.toString(), u.username as string]));

  return project.members.map((m) => {
    const uid = m.userId.toString();
    const serverAccess = servers
      .map((s) => {
        const entry = (s.access as { userId: unknown; permissions: string[] }[]).find(
          (a) => a.userId?.toString() === uid,
        );
        return entry
          ? { serverId: s._id.toString(), serverName: s.name as string, permissions: entry.permissions }
          : null;
      })
      .filter(Boolean) as { serverId: string; serverName: string; permissions: string[] }[];

    return {
      userId: uid,
      username: usernameMap.get(uid) ?? uid,
      role: m.role as ProjectMemberRole,
      serverAccess,
    };
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createProject(data: {
  name: string;
  key: string;
  owner: string;
}): Promise<IProject> {
  await connectDB();

  const key = data.key.toLowerCase().trim();
  if (!KEY_REGEX.test(key)) {
    throw badRequest(
      "Project key must be lowercase alphanumeric with hyphens (e.g. my-project)",
    );
  }

  // --- Projekt-Limit Enforcement ---
  const user = await UserModel.findById(data.owner);
  if (!user) throw new Error("User not found");

  const roleDocs = await RoleModel.find({ name: { $in: user.roles } }).lean();
  const allPermissions = [
    ...roleDocs.flatMap((r: any) => r.permissions || []),
    ...(user.permissions || []),
  ];

  const hasWildcard = allPermissions.some((p: any) => p.name === "*" && p.allow !== false);
  if (!hasWildcard) {
    const createPerm = allPermissions.find((p: any) => p.name === "projects.create" && p.allow !== false);
    if (!createPerm) {
      throw new Error("Keine Berechtigung zum Erstellen von Projekten");
    }
    if (createPerm.value != null) {
      const limit = parseInt(String(createPerm.value), 10);
      if (!isNaN(limit) && limit > 0) {
        const existingCount = await ProjectModel.countDocuments({ owner: data.owner });
        if (existingCount >= limit) {
          throw new Error(`Projektlimit erreicht (${limit})`);
        }
      }
    }
  }

  const existing = await ProjectModel.findOne({ key }).lean();
  if (existing) {
    throw conflict(`A project with key "${key}" already exists`);
  }

  const project = await ProjectModel.create({
    name: data.name.trim(),
    key,
    owner: data.owner,
    members: [],
  });

  // --- Auto-Permissions für den Ersteller ---
  await grantIfAbsent(data.owner, `project.read:${key}`);
  await grantIfAbsent(data.owner, `project.write:${key}`);

  return project.toObject() as IProject;
}

export async function renameProject(
  key: string,
  name: string,
): Promise<IProject> {
  await connectDB();

  const project = await ProjectModel.findOneAndUpdate(
    { key },
    { name: name.trim() },
    { new: true },
  ).lean<IProject>();

  if (!project) throw notFound(`Project "${key}" not found`);
  return project;
}

export async function deleteProject(
  key: string,
  confirmationName: string,
): Promise<void> {
  await connectDB();

  const project = await ProjectModel.findOne({ key });
  if (!project) throw notFound(`Project "${key}" not found`);

  if (project.name !== confirmationName) {
    throw badRequest(
      "Confirmation name does not match the project name",
    );
  }

  // Require all servers to be deleted first
  const serverCount = await ServerModel.countDocuments({ projectKey: key });
  if (serverCount > 0) {
    throw badRequest(
      `Projekt enthält noch ${serverCount} Server. Lösche zuerst alle Server.`,
    );
  }

  await BackupModel.deleteMany({ serverId: { $in: [] } });
  await ProjectLogModel.deleteMany({ projectKey: key });
  await ProjectModel.deleteOne({ _id: project._id });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function addMember(
  projectKey: string,
  userId: string,
  role: ProjectMemberRole,
): Promise<void> {
  await connectDB();

  const project = await ProjectModel.findOne({ key: projectKey });
  if (!project) throw notFound(`Project "${projectKey}" not found`);

  const alreadyMember = project.members.some(
    (m) => m.userId.toString() === userId,
  );
  if (alreadyMember) {
    throw conflict("User is already a member of this project");
  }

  await ProjectModel.updateOne(
    { key: projectKey },
    { $push: { members: { userId, role } } },
  );

  // Auto-grant server permissions based on role
  await grantServerPermissionsForRole(projectKey, userId, role);
}

export async function updateMemberRole(
  projectKey: string,
  userId: string,
  role: ProjectMemberRole,
): Promise<void> {
  await connectDB();

  const result = await ProjectModel.updateOne(
    { key: projectKey, "members.userId": userId },
    { $set: { "members.$.role": role } },
  );

  if (result.matchedCount === 0) {
    throw notFound("Member not found in project");
  }

  // Re-apply server permissions for new role
  await revokeServerPermissionsForProject(projectKey, userId);
  await grantServerPermissionsForRole(projectKey, userId, role);
}

export async function removeMember(
  projectKey: string,
  userId: string,
): Promise<void> {
  await connectDB();

  const result = await ProjectModel.updateOne(
    { key: projectKey },
    { $pull: { members: { userId } } },
  );

  if (result.matchedCount === 0) {
    throw notFound(`Project "${projectKey}" not found`);
  }

  // Revoke all server-level permissions in this project
  await revokeServerPermissionsForProject(projectKey, userId);
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

export async function getProjectLogs(
  projectKey: string,
  options: { page: number; size: number; excludeActions?: ProjectLogAction[] },
): Promise<{
  entries: IProjectLog[];
  total: number;
  page: number;
  size: number;
}> {
  await connectDB();

  const filter: Record<string, unknown> = { projectKey };
  if (options.excludeActions?.length) {
    filter.action = { $nin: options.excludeActions };
  }

  const [entries, total] = await Promise.all([
    ProjectLogModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.size)
      .limit(options.size)
      .lean<IProjectLog[]>(),
    ProjectLogModel.countDocuments(filter),
  ]);

  return { entries, total, page: options.page, size: options.size };
}

export async function logAction(
  projectKey: string,
  action: ProjectLogAction,
  actorId: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await connectDB();
  await ProjectLogModel.create({
    projectKey,
    action,
    actor: actorId,
    details: details ?? {},
  });
}
