import Link from "next/link";
import { Upload, HardDrive, Files } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { getServerT } from "@/lib/i18n/server";

export default async function VerzeichnisPage() {
  const { t } = await getServerT();

  const sections = [
    {
      href: "/verzeichnis/upload",
      icon: Upload,
      title: t("verzeichnis.upload.title"),
      description: t("verzeichnis.upload.description"),
    },
    {
      href: "/verzeichnis/backups",
      icon: HardDrive,
      title: t("verzeichnis.backups.title"),
      description: t("verzeichnis.backups.description"),
    },
    {
      href: "/verzeichnis/dateien",
      icon: Files,
      title: t("verzeichnis.files.title"),
      description: t("verzeichnis.files.description"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("verzeichnis.title")}</h1>
        <p className="text-sm text-zinc-500">{t("verzeichnis.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full cursor-pointer transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
