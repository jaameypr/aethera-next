"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useLocale } from "@/context/locale-context";
import {
  Upload,
  Link2,
  Loader2,
  FileArchive,
  Globe,
  FileText,
  Package,
  Puzzle,
  Database,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ImportResult {
  _id: string;
  filename: string;
  size: number;
  components: string[];
}

interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

function uploadChunked(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<{ status: number; body: string }> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let completedBytes = 0;

  function sendChunk(index: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = index * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkSize = end - start;

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/backups/import/chunk");
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Upload-Id", uploadId);
      xhr.setRequestHeader("X-Chunk-Index", String(index));

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: completedBytes + e.loaded,
            total: file.size,
            percent: Math.round(((completedBytes + e.loaded) / file.size) * 100),
          });
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          completedBytes += chunkSize;
          resolve();
        } else {
          reject(new Error(`Chunk ${index} failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(chunk);
    });
  }

  return (async () => {
    for (let i = 0; i < totalChunks; i++) {
      await sendChunk(i);
    }

    // Finalize
    const res = await fetch("/api/backups/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, filename: file.name }),
    });

    return { status: res.status, body: await res.text() };
  })();
}

interface ImportBackupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: (backup: ImportResult) => void;
}

export function ImportBackupDialog({
  open,
  onOpenChange,
  onImported,
}: ImportBackupDialogProps) {
  const { t } = useLocale();

  const COMPONENT_META: Record<string, { label: string; icon: typeof Globe }> = {
    world:      { label: t("backupDialogs.components.world"),     icon: Globe },
    config:     { label: t("backupDialogs.components.config"),    icon: FileText },
    mods:       { label: t("backupDialogs.components.mods"),      icon: Package },
    plugins:    { label: t("backupDialogs.components.plugins"),   icon: Puzzle },
    datapacks:  { label: t("backupDialogs.components.datapacks"), icon: Database },
  };

  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTab("upload");
    setLoading(false);
    setProgress(null);
    setUrl("");
    setFile(null);
    setDragOver(false);
    setResult(null);
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".tar.gz") || f.name.endsWith(".tgz") || f.name.endsWith(".zip"))) {
      setFile(f);
    } else {
      toast.error(t("backupDialogs.import.unsupportedFile"));
    }
  }, [t]);

  async function pollJobUntilDone(jobId: string): Promise<ImportResult> {
    const MAX_POLLS = 120; // 2 minutes at 1s intervals
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error("Could not fetch job status");
      const job = await res.json();

      if (job.status === "done") {
        const backupId = job.result?.backupId;
        if (!backupId) throw new Error("Import completed but no backup found");
        const br = await fetch(`/api/backups/${backupId}`);
        if (!br.ok) throw new Error("Could not load backup");
        return br.json();
      }

      if (job.status === "error") {
        throw new Error(job.error || "Import failed");
      }
    }
    throw new Error("Import timed out");
  }

  async function handleImport() {
    setLoading(true);
    setProgress(null);
    try {
      let jobId: string;

      if (tab === "url") {
        if (!url.trim()) {
          toast.error(t("backupDialogs.import.urlRequired"));
          return;
        }

        const res = await fetch("/api/backups/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || t("backupDialogs.import.importFailed"));
        }

        ({ jobId } = await res.json());
      } else {
        if (!file) {
          toast.error(t("backupDialogs.import.fileRequired"));
          return;
        }

        const { status, body } = await uploadChunked(file, (p) => setProgress(p));
        setProgress(null);

        if (status < 200 || status >= 300) {
          let errMsg = t("backupDialogs.import.importFailed");
          try { errMsg = JSON.parse(body).error || errMsg; } catch {}
          throw new Error(errMsg);
        }

        ({ jobId } = JSON.parse(body));
      }

      const backup = await pollJobUntilDone(jobId);
      setResult(backup);
      toast.success(t("backupDialogs.import.success"));
      onImported?.(backup);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("backupDialogs.import.importFailed"),
      );
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  if (result) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-brand" />
              {t("backupDialogs.import.resultTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("backupDialogs.import.resultDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium truncate">
                  {result.filename}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatSize(result.size)}
                </span>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">{t("backupDialogs.import.detectedContents")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.components.length === 0 ? (
                    <div className="flex items-center gap-1 text-xs text-warning">
                      <AlertCircle className="h-3 w-3" />
                      {t("backupDialogs.import.noComponents")}
                    </div>
                  ) : (
                    result.components.map((comp) => {
                      const meta = COMPONENT_META[comp];
                      if (!meta) return null;
                      const Icon = meta.icon;
                      return (
                        <Badge
                          key={comp}
                          variant="secondary"
                          className="gap-1 text-xs"
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>{t("backupDialogs.import.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("backupDialogs.import.title")}</DialogTitle>
          <DialogDescription>
            {t("backupDialogs.import.desc")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "upload" | "url")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {t("backupDialogs.import.tabUpload")}
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1">
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {t("backupDialogs.import.tabUrl")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-[border-color,background-color,box-shadow] duration-200 cursor-pointer ${
                dragOver
                  ? "border-brand bg-brand-muted/40 ring-2 ring-brand/40"
                  : file
                    ? "border-brand/60 bg-brand-muted/20"
                    : "border-input hover:border-zinc-400 dark:hover:border-zinc-600"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".tar.gz,.tgz,.zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />

              {file ? (
                <div className="space-y-2">
                  <FileArchive className="mx-auto h-8 w-8 text-brand" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(file.size)}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    {t("backupDialogs.import.changeFile")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload
                    className={`mx-auto h-8 w-8 transition-colors ${
                      dragOver ? "text-brand" : "text-muted-foreground"
                    }`}
                  />
                  <p className="text-sm text-foreground">
                    {t("backupDialogs.import.dropZone")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("backupDialogs.import.fileTypes")}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-url">{t("backupDialogs.import.urlLabel")}</Label>
                <Input
                  id="pv-url"
                  placeholder={t("backupDialogs.import.urlPlaceholder")}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("backupDialogs.import.urlHelper")}
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {progress && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {formatSize(progress.loaded)} / {formatSize(progress.total)} ({progress.percent}%)
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {t("backupDialogs.import.cancel")}
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || (tab === "upload" ? !file : !url.trim())}
          >
            {loading && progress ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("backupDialogs.import.uploading", { percent: progress.percent })}
              </>
            ) : loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("backupDialogs.import.processing")}
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t("backupDialogs.import.import")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
