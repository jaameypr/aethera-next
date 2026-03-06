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

const KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Queries
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

  // Remove all related data
  const servers = await ServerModel.find({ projectKey: key }).lean();
  const serverIds = servers.map((s) => s._id);

  await BackupModel.deleteMany({ serverId: { $in: serverIds } });
  await ServerModel.deleteMany({ projectKey: key });
  await ProjectLogModel.deleteMany({ projectKey: key });
  await ProjectModel.deleteOne({ _id: project._id });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function addMember(
  projectKey: string,
  userId: string,
  role: "admin" | "member",
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
