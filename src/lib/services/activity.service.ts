import "server-only";

import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { type IProjectLog } from "@/lib/db/models/project-log";
import { getProjectLogs } from "@/lib/services/project.service";

export type ProjectFeedEntry = IProjectLog & { actorUsername: string };

export async function getProjectFeed(
  projectKey: string,
  opts: { page: number; size: number },
): Promise<{
  entries: ProjectFeedEntry[];
  total: number;
  page: number;
  size: number;
}> {
  await connectDB();

  const { entries, total, page, size } = await getProjectLogs(projectKey, {
    page: opts.page,
    size: opts.size,
  });

  const actorIds = [...new Set(entries.map((e) => e.actor.toString()))];
  const users = await UserModel.find({ _id: { $in: actorIds } })
    .select("_id username")
    .lean();
  const usernameMap = new Map(
    users.map((u) => [u._id.toString(), u.username as string]),
  );

  return {
    entries: entries.map((e) => ({
      ...e,
      actorUsername: usernameMap.get(e.actor.toString()) ?? e.actor.toString(),
    })),
    total,
    page,
    size,
  };
}
