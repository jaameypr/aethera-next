import { requireSession } from "@/lib/auth/guards";
import { CreateServerWizard } from "@/components/servers/CreateServerWizard";
import { getServerT } from "@/lib/i18n/server";

interface Props {
  params: Promise<{ key: string }>;
}

export default async function NewServerPage({ params }: Props) {
  const { key } = await params;
  await requireSession();
  const { t } = await getServerT();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div className="animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("servers.create.pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("servers.create.projectLabel", { key })}</p>
      </div>
      <CreateServerWizard projectKey={key} />
    </div>
  );
}
