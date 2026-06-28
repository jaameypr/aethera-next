import Link from "next/link";
import {
  ArrowLeft,
  Files,
  FileText,
  FileImage,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileAudio,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import { requireSession } from "@/lib/auth/guards";
import { listUserFiles } from "@/lib/services/user-file.service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FileDeleteButton } from "./FileDeleteButton";
import { getServerT } from "@/lib/i18n/server";

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

/** Coarse relative-time label, falls back to absolute date for older items. */
function relativeDate(date: Date | string): string {
  const then = new Date(date).getTime();
  const diffMs = Date.now() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Map a filename extension to a representative lucide icon + tint. */
function fileTypeIcon(filename: string): { Icon: LucideIcon; tint: string } {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext))
    return { Icon: FileImage, tint: "text-info" };
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "jar"].includes(ext))
    return { Icon: FileArchive, tint: "text-warning" };
  if (
    ["js", "ts", "tsx", "jsx", "json", "yml", "yaml", "toml", "sh", "java", "py"].includes(
      ext,
    )
  )
    return { Icon: FileCode, tint: "text-brand" };
  if (["csv", "xls", "xlsx"].includes(ext))
    return { Icon: FileSpreadsheet, tint: "text-success" };
  if (["mp3", "wav", "ogg", "flac"].includes(ext))
    return { Icon: FileAudio, tint: "text-primary" };
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext))
    return { Icon: FileVideo, tint: "text-destructive" };
  return { Icon: FileText, tint: "text-muted-foreground" };
}

export default async function DateienPage() {
  const session = await requireSession();
  const files = await listUserFiles(session.userId);
  const { t } = await getServerT();

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
            <h1 className="text-2xl font-bold">{t("verzeichnis.files.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {files.length === 0
                ? t("verzeichnis.files.noFiles")
                : files.length === 1
                  ? t("verzeichnis.files.fileCount1", { count: 1 })
                  : t("verzeichnis.files.filesCount", { count: files.length })}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="brand">
          <Link href="/verzeichnis/upload">{t("verzeichnis.files.uploadLink")}</Link>
        </Button>
      </div>

      {files.length === 0 ? (
        <EmptyState
          icon={<Files className="h-6 w-6" />}
          title={t("verzeichnis.files.noFiles")}
          description={t("verzeichnis.files.noFilesYet")}
          action={
            <Button asChild variant="brand" size="sm">
              <Link href="/verzeichnis/upload">{t("verzeichnis.files.uploadLink")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="animate-slide-up overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {t("verzeichnis.files.colName")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {t("verzeichnis.files.colIdentifier")}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                  {t("verzeichnis.files.colSize")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {t("verzeichnis.files.colCreated")}
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  {t("verzeichnis.files.colExpiry")}
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                  {t("verzeichnis.files.colActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const { Icon, tint } = fileTypeIcon(file.originalFilename);
                return (
                  <tr
                    key={file._id.toString()}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="max-w-[220px] px-4 py-2.5 font-medium">
                      <div className="flex items-center gap-2.5">
                        <Icon className={`h-4 w-4 shrink-0 ${tint}`} />
                        <span className="truncate">{file.originalFilename}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {file.identifier}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-muted-foreground"
                      title={formatDate(file.createdAt)}
                    >
                      {relativeDate(file.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(file.expiresAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`/api/files/${file._id.toString()}`}
                            download={file.originalFilename}
                          >
                            {t("verzeichnis.files.download")}
                          </a>
                        </Button>
                        <FileDeleteButton
                          fileId={file._id.toString()}
                          filename={file.originalFilename}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
