import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { BackupModel } from "@/lib/db/models/backup";

export const GET = withAuth(async (_req: NextRequest) => {
  try {
    await connectDB();
    const backups = await BackupModel.find({ status: "completed" })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("_id name filename size components status strategy createdAt")
      .lean();

    return Response.json(
      backups.map((b) => ({
        _id: b._id.toString(),
        name: b.name,
        filename: b.filename,
        size: b.size,
        components: b.components,
        status: b.status,
        strategy: b.strategy,
        createdAt: b.createdAt.toISOString(),
      })),
    );
  } catch (error) {
    return errorResponse(error);
  }
});
