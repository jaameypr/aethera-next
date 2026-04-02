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
import { connectDB } from "@/lib/db/connection";
import { BackupModel } from "@/lib/db/models/backup";
import { ServerModel } from "@/lib/db/models/server";
import { AllBackupsList } from "@/components/backups/all-backups-list";

export default async function BackupsPage() {
  await connectDB();

  const backups = await BackupModel.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const serverIds = [...new Set(backups.map((b) => b.serverId.toString()))];
  const servers = await ServerModel.find({ _id: { $in: serverIds } })
    .select("_id name identifier")
    .lean();
  const serverMap = Object.fromEntries(
    servers.map((s) => [s._id.toString(), s.name]),
  );

  const serialized = backups.map((b) => ({
    _id: b._id.toString(),
    serverId: b.serverId.toString(),
    serverName: serverMap[b.serverId.toString()] ?? (b.strategy === "import" ? "Import" : "Unbekannt"),
    name: b.name,
    filename: b.filename,
    size: b.size,
    components: b.components,
    status: b.status ?? "completed",
    strategy: b.strategy ?? "sync",
    shareUrl: b.shareUrl,
    errorMessage: b.errorMessage,
    createdAt: b.createdAt.toISOString(),
  }));

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
          <p className="text-sm text-zinc-500">
            Alle Server-Sicherungen — {serialized.length} Backups
          </p>
        </div>
      </div>

      {serialized.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <HardDrive className="h-5 w-5 text-zinc-500" />
            </div>
            <CardTitle className="text-base">Keine Backups vorhanden</CardTitle>
            <CardDescription>
              Navigiere zu einem Server und wechsle zum Backups-Tab um
              Sicherungen zu erstellen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/projects">Zu den Projekten</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AllBackupsList backups={serialized} />
      )}
    </div>
  );
}
