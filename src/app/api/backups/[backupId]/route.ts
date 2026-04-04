import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { BackupModel } from "@/lib/db/models/backup";

export const GET = withAuth(async (_req: NextRequest, { params }) => {
  try {
    await connectDB();
    const backup = await BackupModel.findById(params.backupId)
      .select("_id name filename size components status strategy createdAt")
      .lean();

    if (!backup) throw notFound("Backup not found");

    return Response.json({
      _id: backup._id.toString(),
      name: backup.name,
      filename: backup.filename,
      size: backup.size,
      components: backup.components,
      status: backup.status,
      strategy: backup.strategy,
      createdAt: backup.createdAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});
