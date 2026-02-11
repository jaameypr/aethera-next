import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { changePassword } from "@/lib/services/user.service";
import { errorResponse } from "@/lib/api/errors";

export const POST = withAuth(async (req: NextRequest, { session, params }) => {
  try {
    // Users can only change their own password via this endpoint
    if (params.userId !== session.userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: "Current and new password are required" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return Response.json(
        { error: "New password must be at least 8 characters" },
        { status: 400 },
      );
    }

    await changePassword(session.userId, { currentPassword, newPassword });
    return Response.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Current password is incorrect"
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
});
