import { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { resetPassword } from "@/lib/services/user.service";
import { errorResponse } from "@/lib/api/errors";

export const POST = withPermission("admin.users", async (_req: NextRequest, { params }) => {
  try {
    const result = await resetPassword(params.userId);
    return Response.json({
      tempPassword: result.tempPassword,
      emailSent: result.emailSent,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
