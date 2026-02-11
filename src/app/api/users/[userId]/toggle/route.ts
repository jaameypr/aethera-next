import { NextRequest } from "next/server";
import { withPermission } from "@/lib/auth/guards";
import { getUserById, setEnabled } from "@/lib/services/user.service";
import { errorResponse } from "@/lib/api/errors";

export const POST = withPermission("admin.users", async (req: NextRequest, { params }) => {
  try {
    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return Response.json(
        { error: "enabled field required" },
        { status: 400 },
      );
    }

    const user = await getUserById(params.userId);
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    await setEnabled(params.userId, enabled);
    return Response.json({ success: true, enabled });
  } catch (error) {
    return errorResponse(error);
  }
});
