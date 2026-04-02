"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
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

const COMPONENT_META: Record<string, { label: string; icon: typeof Globe }> = {
  world: { label: "Welten", icon: Globe },
  config: { label: "Konfiguration", icon: FileText },
  mods: { label: "Mods", icon: Package },
  plugins: { label: "Plugins", icon: Puzzle },
  datapacks: { label: "Datapacks", icon: Database },
};

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

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percent: Math.round((e.loaded / e.total) * 100),
        });
      }
    });

    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("Upload fehlgeschlagen"));
    xhr.ontimeout = () => reject(new Error("Upload Timeout"));
    xhr.send(file);
  });
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
      toast.error("Nur .tar.gz und .zip Dateien werden unterstützt");
    }
  }, []);

  async function handleImport() {
    setLoading(true);
    setProgress(null);
    try {
      let backup: ImportResult;

      if (tab === "url") {
        if (!url.trim()) {
          toast.error("Bitte eine URL eingeben");
          return;
        }

        const res = await fetch("/api/backups/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Import fehlgeschlagen (${res.status})`);
        }

        backup = await res.json();
      } else {
        if (!file) {
          toast.error("Bitte eine Datei auswählen");
          return;
        }

        const { status, body } = await uploadWithProgress(
          "/api/backups/import",
          file,
          (p) => setProgress(p),
        );

        setProgress(null);

        if (status < 200 || status >= 300) {
          let errMsg = "Import fehlgeschlagen";
          try { errMsg = JSON.parse(body).error || errMsg; } catch {}
          throw new Error(errMsg);
        }

        backup = JSON.parse(body);
      }

      setResult(backup);
      toast.success("Backup erfolgreich importiert");
      onImported?.(backup);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Fehler beim Importieren",
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
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Backup importiert
            </DialogTitle>
            <DialogDescription>
              Die Sicherung wurde erfolgreich analysiert und gespeichert.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileArchive className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium truncate">
                  {result.filename}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatSize(result.size)}
                </span>
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-2">Erkannte Inhalte:</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.components.length === 0 ? (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertCircle className="h-3 w-3" />
                      Keine bekannten Komponenten erkannt
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
            <Button onClick={() => handleOpenChange(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Backup importieren</DialogTitle>
          <DialogDescription>
            Importiere ein bestehendes Backup per Datei-Upload oder
            Paperview-Link.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "upload" | "url")}
        >
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Datei hochladen
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1">
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Paperview-Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div
              className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                  : file
                    ? "border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                    : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600"
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
                  <FileArchive className="mx-auto h-8 w-8 text-green-500" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-zinc-500">
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
                    Andere Datei wählen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="mx-auto h-8 w-8 text-zinc-400" />
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Datei hierher ziehen oder klicken
                  </p>
                  <p className="text-xs text-zinc-500">
                    Nur .tar.gz und .zip Dateien
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-url">Paperview Share-URL</Label>
                <Input
                  id="pv-url"
                  placeholder="https://paperview.example.com/shares/abc123"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-xs text-zinc-500">
                  Gib die URL eines Paperview-Shares ein, der ein
                  Backup enthält.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {progress && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-zinc-500 text-center">
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
            Abbrechen
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading || (tab === "upload" ? !file : !url.trim())}
          >
            {loading && progress ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {progress.percent}% hochgeladen…
              </>
            ) : loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Verarbeite…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Importieren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
