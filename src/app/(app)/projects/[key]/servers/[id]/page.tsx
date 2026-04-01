import { notFound } from "next/navigation";
import mongoose from "mongoose";
import { requireSession } from "@/lib/auth/guards";
import { getServer } from "@/lib/services/server.service";
import { connectDB } from "@/lib/db/connection";
import { UserModel } from "@/lib/db/models/user";
import { ServerDetailTabs } from "@/components/servers/ServerDetailTabs";

interface Props {
  params: Promise<{ key: string; id: string }>;
}

export default async function ServerDetailPage({ params }: Props) {
  const { key, id } = await params;
  await requireSession();

  if (!mongoose.isValidObjectId(id)) return notFound();

  const server = await getServer(id);
  if (!server || server.projectKey !== key) return notFound();

  const plain = JSON.parse(JSON.stringify(server));

  // Resolve usernames for access entries
  if (plain.access?.length) {
    await connectDB();
    const userIds = plain.access.map((a: { userId: string }) => a.userId);
    const users = await UserModel.find({ _id: { $in: userIds } })
      .select("_id username")
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u.username]));
    plain.access = plain.access.map((a: { userId: string; permissions: string[] }) => ({
      ...a,
      username: userMap.get(a.userId) ?? a.userId,
    }));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{plain.name}</h1>
        <p className="text-sm text-zinc-500">
          {plain.runtime} · {plain.identifier} · Port {plain.port}
        </p>
      </div>

      <ServerDetailTabs server={plain} projectKey={key} />
    </div>
  );
}
