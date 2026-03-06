import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/guards";
import { getServer } from "@/lib/services/server.service";
import { ServerDetailTabs } from "@/components/servers/ServerDetailTabs";

interface Props {
  params: Promise<{ key: string; id: string }>;
}

export default async function ServerDetailPage({ params }: Props) {
  const { key, id } = await params;
  await requireSession();

  const server = await getServer(id);
  if (!server || server.projectKey !== key) return notFound();

  const plain = JSON.parse(JSON.stringify(server));

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
