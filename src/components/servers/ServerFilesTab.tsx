"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useLocale } from "@/context/locale-context";
import { toast } from "sonner";
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  FileArchive,
  FileImage,
  FileCog,
  Trash2,
  Upload,
  ChevronRight,
  Download,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  children?: FileTreeNode[];
}

type PendingAction =
  | { type: "delete"; path: string; isDirectory: boolean }
  | { type: "move"; from: string; to: string };

const DRAG_TYPE = "application/x-aethera-path";

/** Encode each path segment but keep slashes as separators */
function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

/** Pick a lucide icon that matches the file extension for quicker scanning. */
function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  const Icon = (() => {
    switch (ext) {
      case "json":
      case "json5":
        return FileJson;
      case "yml":
      case "yaml":
      case "toml":
      case "properties":
      case "conf":
      case "cfg":
      case "ini":
      case "env":
        return FileCog;
      case "js":
      case "ts":
      case "mjs":
      case "cjs":
      case "sh":
      case "bat":
      case "java":
      case "py":
      case "lua":
        return FileCode;
      case "zip":
      case "jar":
      case "gz":
      case "tar":
      case "rar":
      case "7z":
        return FileArchive;
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "webp":
      case "svg":
        return FileImage;
      case "txt":
      case "md":
      case "log":
        return FileText;
      default:
        return File;
    }
  })();
  return <Icon className={className} />;
}

export function ServerFilesTab({ serverId }: { serverId: string }) {
  const { t } = useLocale();
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [search, setSearch] = useState("");

  /** Flat list of all nodes, used for search results */
  const flatNodes = useMemo(() => {
    const out: FileTreeNode[] = [];
    function walk(nodes: FileTreeNode[]) {
      for (const n of nodes) {
        out.push(n);
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return out;
  }, [tree]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return flatNodes.filter((n) => n.name.toLowerCase().includes(q));
  }, [search, flatNodes]);

  useEffect(() => {
    fetchTree();
  }, [serverId]);

  async function fetchTree() {
    try {
      const res = await fetch(`/api/servers/${serverId}/files`);
      if (!res.ok) throw new Error();
      setTree(await res.json());
    } catch {
      toast.error(t("servers.files.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(filepath: string) {
    setSelectedFile(filepath);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/${encodePath(filepath)}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const { content } = await res.json();
      setFileContent(content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.files.readFailed"));
      setFileContent("");
    }
  }

  function handleSave() {
    if (!selectedFile) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/files/${encodePath(selectedFile)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fileContent }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success(t("servers.files.saved"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("servers.files.saveFailed"));
      }
    });
  }

  async function handleDelete(filepath: string) {
    try {
      const res = await fetch(`/api/servers/${serverId}/files/${encodePath(filepath)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success(t("servers.files.deleted"));
      if (selectedFile === filepath) {
        setSelectedFile(null);
        setFileContent("");
      }
      fetchTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.files.deleteFailed"));
    }
  }

  function requestDelete(filepath: string, isDirectory = false) {
    setPendingAction({ type: "delete", path: filepath, isDirectory });
  }

  async function handleMove(from: string, to: string) {
    try {
      const res = await fetch(
        `/api/servers/${serverId}/files/${encodePath(from)}?action=move`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      toast.success(t("servers.files.moved"));
      if (selectedFile === from) {
        setSelectedFile(null);
        setFileContent("");
      }
      fetchTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("servers.files.moveFailed"));
    }
  }

  function requestMove(from: string, toFolder: string) {
    const filename = from.split("/").pop() ?? from;
    const to = toFolder ? `${toFolder}/${filename}` : filename;
    if (from === to) return;
    setPendingAction({ type: "move", from, to });
  }

  async function handleConfirm() {
    if (!pendingAction) return;
    setConfirming(true);
    try {
      if (pendingAction.type === "delete") {
        await handleDelete(pendingAction.path);
      } else {
        await handleMove(pendingAction.from, pendingAction.to);
      }
    } finally {
      setConfirming(false);
      setPendingAction(null);
    }
  }

  function handleDownload(filepath: string) {
    const filename = filepath.split("/").pop() ?? "download";
    const a = document.createElement("a");
    a.href = `/api/servers/${serverId}/files/${encodePath(filepath)}?download=true`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleUploadFiles(files: FileList, targetPath = "") {
    const fileArray = Array.from(files);
    const count = fileArray.length;
    const uploads = fileArray.map(async (file) => {
      const uploadPath = targetPath ? `${targetPath}/${file.name}` : file.name;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/servers/${serverId}/files/${encodePath(uploadPath)}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(file.name);
    });
    try {
      await Promise.all(uploads);
      toast.success(count === 1 ? t("servers.files.uploaded") : t("servers.files.uploadedCount", { count }));
      fetchTree();
    } catch (err) {
      toast.error(t("servers.files.uploadFailed", { name: err instanceof Error ? err.message : "" }));
    }
  }

  function handleUploadInput(
    e: React.ChangeEvent<HTMLInputElement>,
    targetPath = "",
  ) {
    if (!e.target.files?.length) return;
    handleUploadFiles(e.target.files, targetPath);
    e.target.value = "";
  }

  function handleDrop(targetPath: string, e: React.DragEvent) {
    setDragOverPath(null);
    const internalPath = e.dataTransfer.getData(DRAG_TYPE);
    if (internalPath) {
      requestMove(internalPath, targetPath);
    } else if (e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files, targetPath);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[600px] gap-4">
        <div className="w-72 shrink-0 space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2"
              style={{ paddingLeft: `${(i % 3) * 14}px` }}
            >
              <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
              <Skeleton className="h-3.5" style={{ width: `${50 + ((i * 13) % 40)}%` }} />
            </div>
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center rounded-md border border-zinc-200 dark:border-zinc-800">
          <span className="sr-only">{t("servers.files.loading")}</span>
        </div>
      </div>
    );
  }

  const dialogTitle =
    pendingAction?.type === "delete"
      ? t("servers.files.confirmDelete")
      : t("servers.files.confirmMove");

  const dialogDescription =
    pendingAction?.type === "delete"
      ? pendingAction.isDirectory
        ? t("servers.files.deleteFolder", { path: pendingAction.path })
        : t("servers.files.deleteFile", { path: pendingAction.path })
      : pendingAction?.type === "move"
        ? t("servers.files.moveFile", { from: pendingAction.from, to: pendingAction.to })
        : "";

  return (
    <>
      {/* Confirmation dialog */}
      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)} disabled={confirming}>
              {t("servers.files.cancel")}
            </Button>
            <Button
              variant={pendingAction?.type === "delete" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? "…" : pendingAction?.type === "delete" ? t("servers.files.delete") : t("servers.files.move")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex h-[600px] gap-4">
      {/* Tree panel */}
      <div
        className={cn(
          "w-72 shrink-0 overflow-y-auto rounded-md border border-border transition-[box-shadow,transform] duration-200 ease-out",
          dragOverPath === "" && "scale-[1.01] shadow-glow-brand ring-2 ring-brand",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragOverPath === null) setDragOverPath("");
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverPath(null);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragOverPath === "" || dragOverPath === null) {
            handleDrop("", e);
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-2 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500">{t("servers.files.header")}</span>
          <label title={t("servers.files.uploadToRoot")}>
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUploadInput(e, "")}
            />
            <Button variant="ghost" size="sm" asChild>
              <span>
                <Upload className="h-3.5 w-3.5" />
              </span>
            </Button>
          </label>
        </div>

        {/* Search bar */}
        <div className="border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("servers.files.search")}
              className="h-7 pl-7 pr-6 text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-1">
          {searchResults ? (
            /* ── Search results (flat list) ── */
            searchResults.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-zinc-400">{t("servers.files.noResults")}</p>
            ) : (
              searchResults.map((node) => (
                <SearchResultRow
                  key={node.path}
                  node={node}
                  selectedFile={selectedFile}
                  onSelect={handleSelect}
                  onDelete={requestDelete}
                  onDownload={handleDownload}
                  search={search}
                />
              ))
            )
          ) : (
            /* ── Normal tree view ── */
            <>
              {dragOverPath === "" && (
                <div className="animate-fade-in pointer-events-none mb-1 flex items-center justify-center gap-1.5 rounded border-2 border-dashed border-brand px-2 py-2 text-center text-xs font-medium text-brand">
                  <Upload className="h-3.5 w-3.5" />
                  {t("servers.files.dropHere")}
                </div>
              )}
              {tree.length === 0 && dragOverPath !== "" && (
                <div className="px-1 py-6">
                  <EmptyState
                    icon={<Folder className="h-6 w-6" />}
                    title={t("servers.files.noFiles")}
                    description={t("servers.files.dropHere")}
                    className="px-3 py-8"
                  />
                </div>
              )}
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedFile={selectedFile}
                  dragOverPath={dragOverPath}
                  onSelect={handleSelect}
                  onDelete={requestDelete}
                  onDownload={handleDownload}
                  onDragOver={setDragOverPath}
                  onDrop={handleDrop}
                  onUploadInput={handleUploadInput}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <nav className="flex min-w-0 items-center gap-0.5 font-mono text-xs text-muted-foreground">
                {selectedFile.split("/").map((seg, i, arr) => (
                  <span key={i} className="flex min-w-0 items-center gap-0.5">
                    {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
                    <span
                      className={cn(
                        "truncate",
                        i === arr.length - 1 && "font-medium text-foreground",
                      )}
                    >
                      {seg}
                    </span>
                  </span>
                ))}
              </nav>
              <Button size="sm" onClick={handleSave} disabled={isPending} className="ml-2 shrink-0">
                {isPending ? t("servers.files.saving") : t("servers.files.save")}
              </Button>
            </div>
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              className="flex-1 resize-none bg-zinc-950 p-3 font-mono text-sm text-zinc-200 outline-none"
              spellCheck={false}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title={t("servers.files.selectFile")}
              className="border-none"
            />
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/** Highlights the matched portion of `text` for query `q` */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-yellow-200 px-0 dark:bg-yellow-700">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function SearchResultRow({
  node,
  selectedFile,
  onSelect,
  onDelete,
  onDownload,
  search,
}: {
  node: FileTreeNode;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string, isDirectory?: boolean) => void;
  onDownload: (path: string) => void;
  search: string;
}) {
  const { t } = useLocale();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-center">
          <button
            className={cn(
              "flex flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
              !node.isDirectory && selectedFile === node.path && "bg-zinc-200 dark:bg-zinc-800",
            )}
            onClick={() => { if (!node.isDirectory) onSelect(node.path); }}
          >
            {node.isDirectory
              ? <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              : <FileTypeIcon name={node.name} className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
            <span className="truncate text-zinc-700 dark:text-zinc-300">
              <HighlightMatch text={node.name} query={search} />
            </span>
            <span className="ml-auto shrink-0 truncate text-xs text-zinc-400" title={node.path}>
              {node.path.includes("/") ? node.path.split("/").slice(0, -1).join("/") : ""}
            </span>
          </button>
          <button
            className="mr-1 hidden rounded p-0.5 text-zinc-400 hover:text-red-500 group-hover:block"
            onClick={() => onDelete(node.path, node.isDirectory)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDownload(node.path)}>
          <Download />
          {node.isDirectory ? t("servers.files.downloadZip") : t("servers.files.download")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          onClick={() => onDelete(node.path, node.isDirectory)}
        >
          <Trash2 />
          {t("servers.files.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TreeNode({
  node,
  depth,
  selectedFile,
  dragOverPath,
  onSelect,
  onDelete,
  onDownload,
  onDragOver,
  onDrop,
  onUploadInput,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFile: string | null;
  dragOverPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string, isDirectory?: boolean) => void;
  onDownload: (path: string) => void;
  onDragOver: (path: string) => void;
  onDrop: (path: string, e: React.DragEvent) => void;
  onUploadInput: (e: React.ChangeEvent<HTMLInputElement>, targetPath?: string) => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(depth < 1);
  const isDragTarget = dragOverPath === node.path;

  if (node.isDirectory) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "rounded transition-colors duration-150",
              isDragTarget && "bg-brand-muted ring-1 ring-inset ring-brand/40",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragOver(node.path);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop(node.path, e);
            }}
          >
            <div className="group flex items-center">
              <button
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData(DRAG_TYPE, node.path);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={cn(
                  "flex flex-1 items-center gap-1 rounded px-1 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                )}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                onClick={() => setOpen(!open)}
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-zinc-400 transition-transform duration-200 ease-out",
                    open && "rotate-90",
                  )}
                />
                {open ? (
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-brand" />
                ) : (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                )}
                <span className="truncate text-zinc-700 dark:text-zinc-300">{node.name}</span>
                {isDragTarget && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
                    <Upload className="h-3 w-3" />
                    {t("servers.files.dropHere")}
                  </span>
                )}
              </button>
              <button
                className="mr-1 hidden rounded p-0.5 text-zinc-400 hover:text-red-500 group-hover:block"
                onClick={(e) => { e.stopPropagation(); onDelete(node.path, true); }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {open &&
              node.children?.map((child) => (
                <TreeNode
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  selectedFile={selectedFile}
                  dragOverPath={dragOverPath}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  onDownload={onDownload}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onUploadInput={onUploadInput}
                />
              ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onDownload(node.path)}>
            <Download />
            {t("servers.files.downloadZip")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* Custom label-based item so the file picker opens correctly */}
          <label className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Upload className="h-4 w-4 shrink-0" />
            {t("servers.files.uploadHere")}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onUploadInput(e, node.path)}
            />
          </label>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            onClick={() => onDelete(node.path, true)}
          >
            <Trash2 />
            {t("servers.files.delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group flex items-center">
          <button
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, node.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            className={cn(
              "flex flex-1 items-center gap-1 rounded px-1 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
              selectedFile === node.path && "bg-zinc-200 dark:bg-zinc-800",
            )}
            style={{ paddingLeft: `${depth * 12 + 16}px` }}
            onClick={() => onSelect(node.path)}
          >
            <FileTypeIcon name={node.name} className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate text-zinc-700 dark:text-zinc-300">{node.name}</span>
          </button>
          <button
            className="mr-1 hidden rounded p-0.5 text-zinc-400 hover:text-red-500 group-hover:block"
            onClick={() => onDelete(node.path, false)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDownload(node.path)}>
          <Download />
          {t("servers.files.download")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          onClick={() => onDelete(node.path, false)}
        >
          <Trash2 />
          {t("servers.files.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
