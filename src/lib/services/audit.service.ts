import "server-only";

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connection";
import {
  ProjectLogModel,
  type IProjectLog,
  type ProjectLogAction,
} from "@/lib/db/models/project-log";
import { ProjectModel } from "@/lib/db/models/project";
import { ServerModel } from "@/lib/db/models/server";
import { UserModel } from "@/lib/db/models/user";

/**
 * A fully-enriched, JSON-serializable audit entry. Unlike the per-project feed,
 * the audit log spans every project, so each row carries its own project /
 * server / actor context — there is no ambient "current project".
 */
export interface AuditEntry {
  _id: string;
  projectKey: string;
  projectName: string;
  action: ProjectLogAction;
  actor: string;
  actorUsername: string;
  serverId: string | null;
  serverName: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuditQuery {
  page: number;
  size: number;
  projectKey?: string;
  serverId?: string;
  actions?: ProjectLogAction[];
  actor?: string;
  sort?: "asc" | "desc";
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  size: number;
}

/**
 * System-wide audit log. Intended for `admin.system` callers only — it
 * deliberately ignores project membership and returns every matching log entry.
 */
export async function getAuditLog(opts: AuditQuery): Promise<AuditPage> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (opts.projectKey) filter.projectKey = opts.projectKey;
  // Server-scoped actions persist `details.serverId` (a stringified ObjectId).
  if (opts.serverId) filter["details.serverId"] = opts.serverId;
  if (opts.actions?.length) filter.action = { $in: opts.actions };
  if (opts.actor && mongoose.Types.ObjectId.isValid(opts.actor)) {
    filter.actor = new mongoose.Types.ObjectId(opts.actor);
  }

  const sortDir = opts.sort === "asc" ? 1 : -1;

  const [logs, total] = await Promise.all([
    ProjectLogModel.find(filter)
      .sort({ createdAt: sortDir })
      .skip((opts.page - 1) * opts.size)
      .limit(opts.size)
      .lean<IProjectLog[]>(),
    ProjectLogModel.countDocuments(filter),
  ]);

  // Resolve the human-facing labels for this page only — bounded by `size`.
  const actorIds = [...new Set(logs.map((l) => l.actor.toString()))];
  const projectKeys = [...new Set(logs.map((l) => l.projectKey))];
  const serverIds = [
    ...new Set(
      logs
        .map((l) => l.details?.serverId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  const [users, projects, servers] = await Promise.all([
    UserModel.find({ _id: { $in: actorIds } })
      .select("_id username")
      .lean(),
    ProjectModel.find({ key: { $in: projectKeys } })
      .select("key name")
      .lean(),
    ServerModel.find({
      _id: {
        $in: serverIds.filter((id) => mongoose.Types.ObjectId.isValid(id)),
      },
    })
      .select("_id name")
      .lean(),
  ]);

  const userMap = new Map(users.map((u) => [u._id.toString(), u.username as string]));
  const projectMap = new Map(projects.map((p) => [p.key as string, p.name as string]));
  const serverMap = new Map(servers.map((s) => [s._id.toString(), s.name as string]));

  return {
    entries: logs.map((l) => {
      const serverId =
        typeof l.details?.serverId === "string" ? l.details.serverId : null;
      // Deleted servers leave no ServerModel row — fall back to the name that
      // was captured in `details` at the time of the action.
      const fallbackName =
        (l.details?.serverName as string | undefined) ??
        (l.details?.name as string | undefined) ??
        null;
      return {
        _id: l._id.toString(),
        projectKey: l.projectKey,
        projectName: projectMap.get(l.projectKey) ?? l.projectKey,
        action: l.action,
        actor: l.actor.toString(),
        actorUsername: userMap.get(l.actor.toString()) ?? l.actor.toString(),
        serverId,
        serverName: serverId ? (serverMap.get(serverId) ?? fallbackName) : fallbackName,
        details: l.details ?? {},
        createdAt: l.createdAt.toISOString(),
      };
    }),
    total,
    page: opts.page,
    size: opts.size,
  };
}

export interface AuditFilterOptions {
  projects: { key: string; name: string }[];
  servers: { id: string; name: string; projectKey: string }[];
  actors: { id: string; username: string }[];
}

/**
 * The option lists that back the filter rail: every project, every server, and
 * every user who has ever produced a log entry.
 */
export async function getAuditFilterOptions(): Promise<AuditFilterOptions> {
  await connectDB();

  const [projects, servers, actorIds] = await Promise.all([
    ProjectModel.find().select("key name").sort({ name: 1 }).lean(),
    ServerModel.find().select("_id name projectKey").sort({ name: 1 }).lean(),
    ProjectLogModel.distinct("actor"),
  ]);

  const users = await UserModel.find({ _id: { $in: actorIds } })
    .select("_id username")
    .sort({ username: 1 })
    .lean();

  return {
    projects: projects.map((p) => ({
      key: p.key as string,
      name: p.name as string,
    })),
    servers: servers.map((s) => ({
      id: s._id.toString(),
      name: s.name as string,
      projectKey: s.projectKey as string,
    })),
    actors: users.map((u) => ({
      id: u._id.toString(),
      username: u.username as string,
    })),
  };
}
