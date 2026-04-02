import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, badRequest } from "@/lib/api/errors";
import { importBackup } from "@/lib/services/backup.service";
import { downloadFromPaperview } from "@/lib/services/paperview.service";

export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const formData = await req.formData();
    const url = formData.get("url") as string | null;
    const file = formData.get("file") as File | null;

    let buffer: Buffer;
    let filename: string;

    if (url) {
      const result = await downloadFromPaperview(url);
      buffer = result.buffer;
      filename = result.filename;
    } else if (file) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      filename = file.name || "upload.tar.gz";
    } else {
      throw badRequest("Either 'file' or 'url' is required");
    }

    const backup = await importBackup(buffer, filename, session.userId);
    return Response.json(backup, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
