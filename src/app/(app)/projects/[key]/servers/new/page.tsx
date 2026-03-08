import { requireSession } from "@/lib/auth/guards";
import { CreateServerWizard } from "@/components/servers/CreateServerWizard";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function NewServerPage({ params }: Props) {
  const { key } = await params;
  await requireSession();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Server erstellen</h1>
        <p className="text-sm text-zinc-500">Projekt: {key}</p>
      </div>
      <CreateServerWizard projectKey={key} />
    </div>
  );
}
