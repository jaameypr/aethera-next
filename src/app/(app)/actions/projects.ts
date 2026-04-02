"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import {
  createProject,
  getProject,
  renameProject,
  deleteProject,
  addMember,
  removeMember,
  updateMemberRole,
  logAction,
  type ProjectMemberRole,
} from "@/lib/services/project.service";

function revalidateProject(projectKey?: string) {
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  if (projectKey) revalidatePath(`/projects/${projectKey}`);
}

export async function createProjectAction(data: {
  key: string;
  name: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    await createProject({ key: data.key, name: data.name, owner: session.userId });
    await logAction(data.key, "PROJECT_CREATED", session.userId, { name: data.name });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to create project");
  }

  revalidateProject(data.key);
}

export async function renameProjectAction(data: {
  projectKey: string;
  name: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    await renameProject(data.projectKey, data.name);
    await logAction(data.projectKey, "PROJECT_UPDATED", session.userId, {
      field: "name",
      value: data.name,
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to rename project");
  }

  revalidateProject(data.projectKey);
}

export async function deleteProjectAction(data: {
  projectKey: string;
  confirmationName: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    const project = await getProject(data.projectKey);
    if (!project) throw new Error("Project not found");
    if (project.owner.toString() !== session.userId) {
      throw new Error("Nur der Projektinhaber kann das Projekt löschen");
    }
    await deleteProject(data.projectKey, data.confirmationName);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to delete project");
  }

  revalidateProject(data.projectKey);
}

export async function addProjectMemberAction(data: {
  projectKey: string;
  userId: string;
  role: ProjectMemberRole;
}): Promise<void> {
  const session = await requireSession();

  try {
    await addMember(data.projectKey, data.userId, data.role);
    await logAction(data.projectKey, "MEMBER_ADDED", session.userId, {
      userId: data.userId,
      role: data.role,
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to add member");
  }

  revalidateProject(data.projectKey);
}

export async function updateProjectMemberRoleAction(data: {
  projectKey: string;
  userId: string;
  role: ProjectMemberRole;
}): Promise<void> {
  const session = await requireSession();

  try {
    await updateMemberRole(data.projectKey, data.userId, data.role);
    await logAction(data.projectKey, "MEMBER_ROLE_CHANGED", session.userId, {
      userId: data.userId,
      role: data.role,
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to update member role");
  }

  revalidateProject(data.projectKey);
}

export async function removeProjectMemberAction(data: {
  projectKey: string;
  userId: string;
}): Promise<void> {
  const session = await requireSession();

  try {
    await removeMember(data.projectKey, data.userId);
    await logAction(data.projectKey, "MEMBER_REMOVED", session.userId, {
      userId: data.userId,
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to remove member");
  }

  revalidateProject(data.projectKey);
}

export async function searchUsersAction(data: {
  q: string;
}): Promise<{ _id: string; username: string }[]> {
  await requireSession();
  if (!data.q.trim()) return [];

  const { connectDB } = await import("@/lib/db/connection");
  const { UserModel } = await import("@/lib/db/models/user");
  await connectDB();

  const users = await UserModel.find({
    username: { $regex: data.q.trim(), $options: "i" },
    enabled: true,
  })
    .select("_id username")
    .limit(10)
    .lean();

  return users.map((u) => ({ _id: u._id.toString(), username: u.username as string }));
}

