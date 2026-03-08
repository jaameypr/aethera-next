import Link from "next/link";
import { Upload, HardDrive, Files } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

const sections = [
  {
    href: "/verzeichnis/upload",
    icon: Upload,
    title: "Upload",
    description:
      "Lade Welt-Dateien, Datenpakete oder andere Ressourcen hoch. Dateien werden nach 48 Stunden automatisch gelöscht.",
  },
  {
    href: "/verzeichnis/backups",
    icon: HardDrive,
    title: "Backups",
    description:
      "Verwalte Backups deiner Server. Erstelle manuelle Sicherungen oder stelle frühere Zustände wieder her.",
  },
  {
    href: "/verzeichnis/dateien",
    icon: Files,
    title: "Dateien",
    description:
      "Zeige alle hochgeladenen Dateien an. Lade sie herunter oder lösche sie.",
  },
];

export default function VerzeichnisPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Verzeichnis</h1>
        <p className="text-sm text-zinc-500">
          Uploads, Backups und Dateiverwaltung
        </p>
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
