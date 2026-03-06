import { connectDB } from "@/lib/db/connection";
import { ProjectModel } from "@/lib/db/models/project";
import type { IServer } from "@/lib/db/models/server";

/**
 * Check whether a user may access a server.
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
