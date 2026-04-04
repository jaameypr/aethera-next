import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, notFound } from "@/lib/api/errors";
import { connectDB } from "@/lib/db/connection";
import { AsyncJobModel } from "@/lib/db/models/async-job";

export const GET = withAuth(async (_req: NextRequest, { params }) => {
  try {
    await connectDB();
    const job = await AsyncJobModel.findById(params.jobId).lean();
    if (!job) throw notFound("Job not found");

    return Response.json({
      jobId: job._id.toString(),
      type: job.type,
      status: job.status,
      progress: job.progress,
      message: job.message,
      result: job.result ?? null,
      error: job.error ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
