import Link from "next/link";
import { HardDrive, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BackupsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/verzeichnis">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Backups</h1>
          <p className="text-sm text-zinc-500">Server-Sicherungen</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <HardDrive className="h-5 w-5 text-zinc-500" />
          </div>
          <CardTitle className="text-base">Keine Backups vorhanden</CardTitle>
          <CardDescription>
            Backups werden verfügbar, wenn Server erstellt sind. Navigiere zu
            einem Server und wechsle zum Backups-Tab um Sicherungen zu
            verwalten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/projects">Zu den Projekten</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
