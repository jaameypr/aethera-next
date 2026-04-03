"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
  Folder,
  FolderOpen,
  File,
  Trash2,
  Upload,
  ChevronRight,
  ChevronDown,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  children?: FileTreeNode[];
}

export function ServerFilesTab({ serverId }: { serverId: string }) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  useEffect(() => {
    fetchTree();
  }, [serverId]);

  async function fetchTree() {
    try {
      const res = await fetch(`/api/servers/${serverId}/files`);
      if (!res.ok) throw new Error();
      setTree(await res.json());
    } catch {
      toast.error("Dateien konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(filepath: string) {
    setSelectedFile(filepath);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/${filepath}`);
      if (!res.ok) throw new Error((await res.json()).error);
      const { content } = await res.json();
      setFileContent(content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Datei konnte nicht gelesen werden");
      setFileContent("");
    }
  }

  function handleSave() {
    if (!selectedFile) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/files/${selectedFile}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fileContent }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("Datei gespeichert");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
      }
    });
  }

  async function handleDelete(filepath: string) {
    try {
      const res = await fetch(`/api/servers/${serverId}/files/${filepath}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Gelöscht");
      if (selectedFile === filepath) {
        setSelectedFile(null);
        setFileContent("");
      }
      fetchTree();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }

  function handleDownload(filepath: string) {
    const filename = filepath.split("/").pop() ?? "download";
    const a = document.createElement("a");
    a.href = `/api/servers/${serverId}/files/${filepath}?download=true`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleUploadFiles(files: FileList, targetPath = "") {
    const uploads = Array.from(files).map(async (file) => {
      const uploadPath = targetPath ? `${targetPath}/${file.name}` : file.name;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/servers/${serverId}/files/${uploadPath}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(file.name);
    });
    try {
      await Promise.all(uploads);
      toast.success(
        files.length === 1 ? "Hochgeladen" : `${files.length} Dateien hochgeladen`,
      );
      fetchTree();
    } catch (err) {
      toast.error(`Upload fehlgeschlagen: ${err instanceof Error ? err.message : ""}`);
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

  function handleDrop(targetPath: string, files: FileList) {
    if (files.length === 0) return;
    handleUploadFiles(files, targetPath);
    setDragOverPath(null);
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Lade Dateien…</p>;
  }

  return (
    <div className="flex h-[600px] gap-4">
      {/* Tree panel */}
      <div
        className={cn(
          "w-72 shrink-0 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800",
          dragOverPath === "" && "ring-2 ring-blue-500 dark:ring-blue-400",
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
            handleDrop("", e.dataTransfer.files);
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 p-2 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500">Dateien</span>
          <label title="In Root hochladen">
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

        <div className="p-1">
          {dragOverPath === "" && (
            <div className="pointer-events-none mb-1 rounded border-2 border-dashed border-blue-400 px-2 py-2 text-center text-xs text-blue-400">
              Hier ablegen
            </div>
          )}
          {tree.length === 0 && dragOverPath !== "" && (
            <p className="px-2 py-4 text-center text-xs text-zinc-400">Keine Dateien</p>
          )}
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              dragOverPath={dragOverPath}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onDragOver={setDragOverPath}
              onDrop={handleDrop}
              onUploadInput={handleUploadInput}
            />
          ))}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        {selectedFile ? (
          <>
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <span className="truncate font-mono text-xs text-zinc-500">
                {selectedFile}
              </span>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? "Speichere…" : "Speichern"}
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
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
            Datei auswählen
          </div>
        )}
      </div>
    </div>
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
  onDelete: (path: string) => void;
  onDownload: (path: string) => void;
  onDragOver: (path: string) => void;
  onDrop: (path: string, files: FileList) => void;
  onUploadInput: (e: React.ChangeEvent<HTMLInputElement>, targetPath?: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isDragTarget = dragOverPath === node.path;

  if (node.isDirectory) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragOver(node.path);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop(node.path, e.dataTransfer.files);
            }}
          >
            <button
              className={cn(
                "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
                isDragTarget && "bg-blue-50 ring-1 ring-blue-400 dark:bg-blue-900/30",
              )}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              onClick={() => setOpen(!open)}
            >
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400" />
              )}
              {open ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              )}
              <span className="truncate text-zinc-700 dark:text-zinc-300">{node.name}</span>
              {isDragTarget && (
                <span className="ml-auto shrink-0 text-xs text-blue-400">Ablegen</span>
              )}
            </button>
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
            Als ZIP herunterladen
          </ContextMenuItem>
          <ContextMenuSeparator />
          {/* Custom label-based item so the file picker opens correctly */}
          <label className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Upload className="h-4 w-4 shrink-0" />
            Hier hochladen
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
            onClick={() => onDelete(node.path)}
          >
            <Trash2 />
            Löschen
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
            className={cn(
              "flex flex-1 items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
              selectedFile === node.path && "bg-zinc-200 dark:bg-zinc-800",
            )}
            style={{ paddingLeft: `${depth * 12 + 16}px` }}
            onClick={() => onSelect(node.path)}
          >
            <File className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="truncate text-zinc-700 dark:text-zinc-300">{node.name}</span>
          </button>
          <button
            className="mr-1 hidden rounded p-0.5 text-zinc-400 hover:text-red-500 group-hover:block"
            onClick={() => onDelete(node.path)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onDownload(node.path)}>
          <Download />
          Herunterladen
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          onClick={() => onDelete(node.path)}
        >
          <Trash2 />
          Löschen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}



