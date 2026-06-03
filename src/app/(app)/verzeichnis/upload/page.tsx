"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/context/locale-context";

const IDENTIFIER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const { t } = useLocale();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const identifierError =
    identifier && !IDENTIFIER_RE.test(identifier)
      ? t("verzeichnis.upload.identifierError")
      : null;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !identifier || identifierError) return;

    setUploading(true);
    setProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("identifier", identifier);

      // XHR (not fetch) so we can surface real upload progress.
      const { status, body } = await new Promise<{ status: number; body: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/files");
          xhr.upload.addEventListener("progress", (ev) => {
            if (ev.lengthComputable) {
              setProgress(Math.round((ev.loaded / ev.total) * 100));
            }
          });
          xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
          xhr.onerror = () => reject(new Error(t("verzeichnis.upload.uploadFailed")));
          xhr.send(formData);
        },
      );

      if (status < 200 || status >= 300) {
        let errMsg = t("verzeichnis.upload.uploadFailed");
        try {
          errMsg = JSON.parse(body).error ?? errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      toast.success(t("verzeichnis.upload.uploadSuccess"));
      router.push("/verzeichnis/dateien");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("verzeichnis.upload.uploadFailed"));
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/verzeichnis">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t("verzeichnis.upload.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("verzeichnis.upload.autoDelete")}
          </p>
        </div>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">{t("verzeichnis.upload.uploadCard")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Identifier */}
            <div className="space-y-1">
              <Label htmlFor="identifier">{t("verzeichnis.upload.identifierLabel")}</Label>
              <Input
                id="identifier"
                placeholder={t("verzeichnis.upload.identifierPlaceholder")}
                className="font-mono"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.toLowerCase())}
              />
              {identifierError && (
                <p className="text-xs text-destructive">{identifierError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("verzeichnis.upload.identifierHint")}
              </p>
            </div>

            {/* File picker */}
            <div className="space-y-1">
              <Label>{t("verzeichnis.upload.fileLabel")}</Label>
              <div
                className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition-[border-color,background-color,box-shadow] duration-200 ${
                  dragOver
                    ? "border-brand bg-brand-muted/40 ring-2 ring-brand/40"
                    : file
                      ? "border-brand/60 bg-brand-muted/20"
                      : "border-input hover:border-zinc-400 dark:hover:border-zinc-500"
                }`}
                onClick={() => !uploading && inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!uploading) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileIcon className="h-8 w-8 shrink-0 text-brand" />
                    <div className="text-left">
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.size)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload
                      className={`mx-auto h-8 w-8 transition-colors ${
                        dragOver ? "text-brand" : "text-muted-foreground"
                      }`}
                    />
                    <p className="text-sm text-muted-foreground">
                      {t("verzeichnis.upload.clickToSelect")}
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {uploading && progress !== null && (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {t("verzeichnis.upload.uploading")} {progress}%
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="brand"
              disabled={uploading || !file || !identifier || !!identifierError}
              className="w-full"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              {uploading ? t("verzeichnis.upload.uploading") : t("verzeichnis.upload.uploadBtn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
