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

import mongoose from "mongoose";
import { ProjectModel } from "@/lib/db/models/project";
import { ProjectLogModel } from "@/lib/db/models/project-log";
import { ActivityReadModel } from "@/lib/db/models/activity-read";

const EPOCH = new Date(0);

/** All project keys the user can see (owner or member). */
async function userProjectKeys(userId: string): Promise<string[]> {
  const projects = await ProjectModel.find({
    $or: [{ owner: userId }, { "members.userId": userId }],
  })
    .select("key")
    .lean();
  return projects.map((p) => p.key as string);
}

export async function getUnreadSummary(
  userId: string,
): Promise<{ total: number; perProject: Record<string, number> }> {
  await connectDB();

  const keys = await userProjectKeys(userId);
  if (keys.length === 0) return { total: 0, perProject: {} };

  const reads = await ActivityReadModel.find({ userId, projectKey: { $in: keys } })
    .select("projectKey lastSeenAt")
    .lean();
  const seenMap = new Map(reads.map((r) => [r.projectKey, r.lastSeenAt as Date]));

  const actorObjectId = new mongoose.Types.ObjectId(userId);
  const perProject: Record<string, number> = {};
  let total = 0;

  for (const key of keys) {
    const since = seenMap.get(key) ?? EPOCH;
    const count = await ProjectLogModel.countDocuments({
      projectKey: key,
      createdAt: { $gt: since },
      actor: { $ne: actorObjectId },
    });
    if (count > 0) {
      perProject[key] = count;
      total += count;
    }
  }

  return { total, perProject };
}

export async function markSeen(userId: string, projectKey: string): Promise<void> {
  await connectDB();
  await ActivityReadModel.updateOne(
    { userId, projectKey },
    { $set: { lastSeenAt: new Date() } },
    { upsert: true },
  );
}
