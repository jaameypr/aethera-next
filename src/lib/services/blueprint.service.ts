import "server-only";

import { connectDB } from "@/lib/db/connection";
import {
  BlueprintModel,
  type IBlueprint,
} from "@/lib/db/models/blueprint";
import { ProjectModel } from "@/lib/db/models/project";
import { createServer, type ServerCreateInput } from "@/lib/services/server.service";
import { forbidden, notFound } from "@/lib/api/errors";
import { logAction } from "@/lib/services/project.service";

export type { IBlueprint };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveProjectRole(
  projectKey: string,
  userId: string,
): Promise<"owner" | "admin" | "member" | null> {
  await connectDB();
  const project = await ProjectModel.findOne({ key: projectKey }).lean();
  if (!project) return null;

  if (project.owner.toString() === userId) return "owner";

  const member = project.members.find((m) => m.userId.toString() === userId);
  if (!member) return null;
  return member.role === "admin" ? "admin" : "member";
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listBlueprints(
  projectKey: string,
  userId: string,
): Promise<IBlueprint[]> {
  await connectDB();

  const role = await resolveProjectRole(projectKey, userId);
  if (!role) return [];

  return BlueprintModel.find({ projectKey })
    .sort({ createdAt: -1 })
    .lean<IBlueprint[]>();
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createBlueprint(
  projectKey: string,
  data: { name: string; maxRam: number },
  actorId: string,
): Promise<IBlueprint> {
  await connectDB();

  const role = await resolveProjectRole(projectKey, actorId);
  if (role !== "owner" && role !== "admin") throw forbidden();

  const blueprint = await BlueprintModel.create({
    projectKey,
    name: data.name.trim(),
    maxRam: data.maxRam,
    status: "available",
    createdBy: actorId,
  });

  await logAction(projectKey, "SERVER_CREATED", actorId, {
    event: "BLUEPRINT_CREATED",
    blueprintId: blueprint._id.toString(),
    name: data.name,
    maxRam: data.maxRam,
  });

  return blueprint.toObject() as IBlueprint;
}

export async function deleteBlueprint(
  blueprintId: string,
  actorId: string,
): Promise<void> {
  await connectDB();

  const blueprint = await BlueprintModel.findById(blueprintId);
  if (!blueprint) throw notFound("Blueprint not found");

  const role = await resolveProjectRole(blueprint.projectKey, actorId);
  if (role !== "owner" && role !== "admin") throw forbidden();

  await BlueprintModel.findByIdAndDelete(blueprintId);
}

export async function updateBlueprint(
  blueprintId: string,
  data: { name?: string; maxRam?: number },
  actorId: string,
): Promise<IBlueprint> {
  await connectDB();

  const blueprint = await BlueprintModel.findById(blueprintId);
  if (!blueprint) throw notFound("Blueprint not found");
  if (blueprint.status !== "available") {
    throw new Error("Nur verfügbare Blueprints können bearbeitet werden");
  }

  const role = await resolveProjectRole(blueprint.projectKey, actorId);
  if (role !== "owner" && role !== "admin") throw forbidden();

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.maxRam !== undefined) update.maxRam = data.maxRam;

  const updated = await BlueprintModel.findByIdAndUpdate(blueprintId, update, {
    returnDocument: "after",
  }).lean<IBlueprint>();

  return updated!;
}

export async function initializeBlueprint(
  blueprintId: string,
  serverData: ServerCreateInput,
  actorId: string,
): Promise<{ serverId: string }> {
  await connectDB();

  const blueprint = await BlueprintModel.findById(blueprintId);
  if (!blueprint) throw notFound("Blueprint not found");
  if (blueprint.status === "claimed") {
    throw new Error("Blueprint is already claimed");
  }

  const role = await resolveProjectRole(blueprint.projectKey, actorId);
  if (!role) throw forbidden();

  if (serverData.memory > blueprint.maxRam) {
    throw new Error(
      `RAM exceeds blueprint limit: ${serverData.memory} MB requested, ${blueprint.maxRam} MB allowed`,
    );
  }

  const server = await createServer(blueprint.projectKey, serverData, actorId);
  const serverId = server._id.toString();

  await BlueprintModel.findByIdAndUpdate(blueprintId, {
    status: "claimed",
    serverId: server._id,
  });

  await logAction(blueprint.projectKey, "SERVER_CREATED", actorId, {
    event: "BLUEPRINT_INITIALIZED",
    blueprintId: blueprint._id.toString(),
    serverId,
  });

  return { serverId };
}
