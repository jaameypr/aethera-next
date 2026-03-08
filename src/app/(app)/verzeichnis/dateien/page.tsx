import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { listUserFiles } from "@/lib/services/user-file.service";
import { Button } from "@/components/ui/button";
import { FileDeleteButton } from "./FileDeleteButton";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DateienPage() {
  const session = await requireSession();
  const files = await listUserFiles(session.userId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/verzeichnis">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Dateien</h1>
            <p className="text-sm text-zinc-500">
              {files.length === 0
                ? "Keine Dateien vorhanden"
                : `${files.length} Datei${files.length !== 1 ? "en" : ""}`}
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/verzeichnis/upload">Hochladen</Link>
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Noch keine Dateien hochgeladen.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                <th className="px-4 py-2.5 text-left font-medium text-zinc-500">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-500">
                  Identifier
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-zinc-500">
                  Größe
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-500">
                  Erstellt
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-zinc-500">
                  Ablauf
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-zinc-500">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file._id.toString()}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td className="max-w-[200px] truncate px-4 py-2.5 font-medium">
                    {file.originalFilename}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">
                    {file.identifier}
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">
                    {formatBytes(file.sizeBytes)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {formatDate(file.createdAt)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">
                    {formatDate(file.expiresAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/files/${file._id.toString()}`}
                          download={file.originalFilename}
                        >
                          Download
                        </a>
                      </Button>
                      <FileDeleteButton fileId={file._id.toString()} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
