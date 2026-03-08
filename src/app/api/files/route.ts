import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { errorResponse } from "@/lib/api/errors";
import {
  uploadUserFile,
  listUserFiles,
} from "@/lib/services/user-file.service";

export const GET = withAuth(async (_req: NextRequest, { session }) => {
  try {
    const files = await listUserFiles(session.userId);
    return Response.json(files);
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, { session }) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const identifier = (formData.get("identifier") as string | null)?.trim();

    if (!file || !identifier) {
      return Response.json(
        { error: "file and identifier are required" },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier)) {
      return Response.json(
        { error: "identifier must be lowercase alphanumeric with hyphens" },
        { status: 400 },
      );
    }

    const doc = await uploadUserFile(file, identifier, session.userId);
    return Response.json(doc, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
});
