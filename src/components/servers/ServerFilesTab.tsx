"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Folder, File, Trash2, Upload, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/servers/${serverId}/files/${file.name}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      toast.success("Hochgeladen");
      fetchTree();
    } catch {
      toast.error("Upload fehlgeschlagen");
    }
    e.target.value = "";
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Lade Dateien…</p>;
  }

  return (
    <div className="flex h-[600px] gap-4">
      {/* Tree panel */}
      <div className="w-72 shrink-0 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-200 p-2 dark:border-zinc-800">
          <span className="text-xs font-medium text-zinc-500">Dateien</span>
          <label>
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
            />
            <Button variant="ghost" size="sm" asChild>
              <span>
                <Upload className="h-3.5 w-3.5" />
              </span>
            </Button>
          </label>
        </div>
        <div className="p-1">
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelect={handleSelect}
              onDelete={handleDelete}
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
  onSelect,
  onDelete,
}: {
  node: FileTreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);

  if (node.isDirectory) {
    return (
      <div>
        <button
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400" />
          )}
          <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <span className="truncate text-zinc-700 dark:text-zinc-300">
            {node.name}
          </span>
        </button>
        {open &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
      </div>
    );
  }

  return (
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
        <span className="truncate text-zinc-700 dark:text-zinc-300">
          {node.name}
        </span>
      </button>
      <button
        className="mr-1 hidden rounded p-0.5 text-zinc-400 hover:text-red-500 group-hover:block"
        onClick={() => onDelete(node.path)}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
