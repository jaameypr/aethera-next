"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guards";
import {
  createProject,
  renameProject,
  deleteProject,
  addMember,
  removeMember,
  logAction,
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
  await requireSession();

  try {
    await deleteProject(data.projectKey, data.confirmationName);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to delete project");
  }

  revalidateProject(data.projectKey);
}

export async function addProjectMemberAction(data: {
  projectKey: string;
  userId: string;
  role: "admin" | "member";
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
