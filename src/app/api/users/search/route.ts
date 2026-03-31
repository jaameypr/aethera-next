import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/guards";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";

export const GET = withAuth(async (req: NextRequest, { session }) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return Response.json([]);

  await connectDB();

  const users = await UserModel.find({
    username: { $regex: q, $options: "i" },
    _id: { $ne: session.userId },
    enabled: true,
  })
    .select("_id username")
    .limit(10)
    .lean();

  return Response.json(users.map((u) => ({ _id: u._id.toString(), username: u.username })));
});
