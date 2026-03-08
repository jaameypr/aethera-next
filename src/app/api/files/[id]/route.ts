import type { NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse, forbidden, notFound } from "@/lib/api/errors";
import { getUserFile, deleteUserFile } from "@/lib/services/user-file.service";

export const GET = withAuth(async (_req: NextRequest, { session, params }) => {
  try {
    const doc = await getUserFile(params.id);
    if (!doc) throw notFound("File not found");
    if (doc.userId.toString() !== session.userId) throw forbidden();

    const nodeStream = createReadStream(doc.storagePath);
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) =>
          controller.enqueue(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
          ),
        );
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new Response(webStream, {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.originalFilename)}"`,
        "Content-Length": String(doc.sizeBytes),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

export const DELETE = withAuth(
  async (_req: NextRequest, { session, params }) => {
    try {
      const doc = await getUserFile(params.id);
      if (!doc) throw notFound("File not found");
      if (doc.userId.toString() !== session.userId) throw forbidden();

      await deleteUserFile(params.id);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  },
);
