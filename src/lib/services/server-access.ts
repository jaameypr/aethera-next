import "server-only";

import { connectDB } from "@/lib/db/connection";
import { ProjectModel } from "@/lib/db/models/project";
import type { IServer } from "@/lib/db/models/server";
import { forbidden, notFound } from "@/lib/api/errors";

/**
 * Check whether a user may access a server at all (read-level gate).
 * Access is granted when the user is the project owner, a project member,
 * or listed in the server-level access array.
 */
export async function canAccessServer(
  server: IServer,
  userId: string,
): Promise<boolean> {
  // Server-level access
  if (server.access?.some((a) => a.userId.toString() === userId)) {
    return true;
  }

  // Project-level access
  await connectDB();
  const project = await ProjectModel.findOne({
    key: server.projectKey,
  }).lean();
  if (!project) return false;

  return (
    project.owner.toString() === userId ||
    project.members.some((m) => m.userId.toString() === userId)
  );
}

/**
 * Return the calling user's effective context for a server:
 * - isOwner: true when the user owns the project (all operations allowed)
 * - permissions: the permission list from their server.access entry, or []
 *
 * Use this in server components to gate tab visibility without a full DB
 * round-trip per permission check.
 */
export async function getServerUserContext(
  server: IServer,
  userId: string,
): Promise<{ isOwner: boolean; permissions: string[] }> {
  await connectDB();
  const project = await ProjectModel.findOne({ key: server.projectKey })
    .select("owner")
    .lean();

  if (!project) return { isOwner: false, permissions: [] };

  if (project.owner.toString() === userId) {
    return { isOwner: true, permissions: [] };
  }

  const entry = server.access?.find((a) => a.userId.toString() === userId);
  return { isOwner: false, permissions: entry?.permissions ?? [] };
}

/**
 * Assert that a user holds a specific operation permission on a server.
 * The project owner is always permitted. For all others, the check is
 * based solely on their entry in server.access — the canonical per-server
 * permission record populated when members are added and servers are created.
 * Throws if permission is denied.
 */
export async function assertServerPermission(
  server: IServer,
  userId: string,
  permission: string,
): Promise<void> {
  await connectDB();
  const project = await ProjectModel.findOne({ key: server.projectKey })
    .select("owner")
    .lean();

  if (!project) throw notFound("Project not found");

  // Project owner always has full access
  if (project.owner.toString() === userId) return;

  // For all others, check their explicit server.access entry
  const entry = server.access?.find((a) => a.userId.toString() === userId);
  if (entry?.permissions.includes(permission)) return;

  throw forbidden("Permission denied");
}
