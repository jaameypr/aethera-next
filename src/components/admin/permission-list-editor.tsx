"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Search, Check } from "lucide-react";
import { PERMISSION_DEFINITIONS, PERMISSION_QUICK_PRESETS } from "@/lib/permission-presets";
import type { PermissionEntry } from "@/lib/api/types";
import { useLocale } from "@/context/locale-context";
import { cn } from "@/lib/utils";

interface PermissionListEditorProps {
  permissions: PermissionEntry[];
  onChange: (permissions: PermissionEntry[]) => void;
}

/** Order categories deterministically; unknown ones fall to the end. */
const CATEGORY_ORDER = ["Global", "Admin", "Projects", "Files", "Modules"];

function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function PermissionListEditor({
  permissions,
  onChange,
}: PermissionListEditorProps) {
  const { t } = useLocale();
  const [newPermName, setNewPermName] = useState("");
  const [search, setSearch] = useState("");

  const addPermission = (name: string) => {
    if (!name || permissions.some((p) => p.name === name)) return;
    onChange([...permissions, { name, allow: true }]);
    setNewPermName("");
  };

  const removePermission = (name: string) => {
    onChange(permissions.filter((p) => p.name !== name));
  };

  const togglePermission = (name: string) => {
    onChange(
      permissions.map((p) =>
        p.name === name ? { ...p, allow: !p.allow } : p,
      ),
    );
  };

  const applyPreset = (presetName: string) => {
    const preset = PERMISSION_QUICK_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      onChange(preset.permissions);
    }
  };

  /** A preset is "active" when the current set matches it exactly. */
  const activePreset = useMemo(() => {
    const cur = new Set(
      permissions.filter((p) => p.allow).map((p) => p.name),
    );
    const denied = permissions.filter((p) => !p.allow).length;
    if (denied > 0) return null;
    return (
      PERMISSION_QUICK_PRESETS.find((preset) => {
        const ps = preset.permissions.filter((p) => p.allow).map((p) => p.name);
        return ps.length === cur.size && ps.every((n) => cur.has(n));
      })?.name ?? null
    );
  }, [permissions]);

  const selectedNames = useMemo(
    () => new Set(permissions.map((p) => p.name)),
    [permissions],
  );

  /** Group the currently-selected permissions by category for the matrix. */
  const groupedSelected = useMemo(() => {
    const byCat = new Map<string, PermissionEntry[]>();
    for (const perm of permissions) {
      const def = PERMISSION_DEFINITIONS.find((d) => d.name === perm.name);
      const cat = def?.category ?? "Custom";
      const arr = byCat.get(cat) ?? [];
      arr.push(perm);
      byCat.set(cat, arr);
    }
    return [...byCat.entries()].sort(
      (a, b) => categoryRank(a[0]) - categoryRank(b[0]),
    );
  }, [permissions]);

  /** Available (not yet added) definitions, filtered by search, grouped. */
  const groupedAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    const avail = PERMISSION_DEFINITIONS.filter(
      (d) =>
        !selectedNames.has(d.name) &&
        (q === "" ||
          d.name.toLowerCase().includes(q) ||
          d.label.toLowerCase().includes(q)),
    );
    const byCat = new Map<string, typeof avail>();
    for (const def of avail) {
      const arr = byCat.get(def.category) ?? [];
      arr.push(def);
      byCat.set(def.category, arr);
    }
    return [...byCat.entries()].sort(
      (a, b) => categoryRank(a[0]) - categoryRank(b[0]),
    );
  }, [search, selectedNames]);

  return (
    <div className="space-y-4">
      {/* Quick presets — visibly grouped in their own framed block */}
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <Label className="mb-2 block text-xs font-medium text-zinc-500">
          {t("admin.permEditor.quickPresets")}
        </Label>
        <div className="flex flex-wrap gap-2">
          {PERMISSION_QUICK_PRESETS.map((preset) => {
            const active = activePreset === preset.name;
            return (
              <Button
                key={preset.name}
                type="button"
                variant={active ? "brand" : "outline"}
                size="sm"
                onClick={() => applyPreset(preset.name)}
                title={preset.description}
                className="transition-all"
              >
                {active && <Check className="mr-1 h-3.5 w-3.5" />}
                {preset.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Current permissions — grouped matrix */}
      <div className="space-y-3">
        <Label className="text-xs font-medium text-zinc-500">
          {t("admin.permEditor.permissions")}
        </Label>
        {permissions.length === 0 && (
          <p className="text-sm text-zinc-400">
            {t("admin.permEditor.noPermissions")}
          </p>
        )}
        {groupedSelected.map(([category, perms]) => (
          <div key={category} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {category}
            </p>
            <div className="space-y-1.5">
              {perms.map((perm) => {
                const def = PERMISSION_DEFINITIONS.find(
                  (d) => d.name === perm.name,
                );
                return (
                  <div
                    key={perm.name}
                    className={cn(
                      "flex items-center gap-3 rounded-md border p-2 transition-colors",
                      perm.allow
                        ? "border-brand/30 bg-brand-muted/40"
                        : "border-border bg-muted/30",
                    )}
                  >
                    <Switch
                      checked={perm.allow}
                      onCheckedChange={() => togglePermission(perm.name)}
                    />
                    <div className="flex-1">
                      <p className="font-mono text-sm font-medium">
                        {perm.name}
                      </p>
                      {def && (
                        <p className="text-xs text-zinc-500">
                          {def.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        perm.allow
                          ? "bg-success-muted text-success"
                          : "bg-destructive-muted text-destructive",
                      )}
                    >
                      {perm.allow ? "Allow" : "Deny"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePermission(perm.name)}
                      className="h-8 w-8 text-zinc-400 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add from catalog — searchable, grouped picker */}
      <div className="space-y-2 rounded-lg border border-border p-3">
        <Label className="text-xs font-medium text-zinc-500">
          {t("admin.permEditor.selectPermission")}
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions…"
            className="pl-8"
          />
        </div>
        <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
          {groupedAvailable.length === 0 && (
            <p className="py-2 text-center text-xs text-zinc-400">
              {t("admin.permEditor.noPermissions")}
            </p>
          )}
          {groupedAvailable.map(([category, defs]) => (
            <div key={category} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                {category}
              </p>
              {defs.map((def) => (
                <button
                  key={def.name}
                  type="button"
                  onClick={() => addPermission(def.name)}
                  className="group flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-brand" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">
                      {def.label}
                    </span>
                    <span className="block font-mono text-[11px] text-zinc-500">
                      {def.name}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Custom permission */}
      <div className="flex gap-2">
        <Input
          placeholder={t("admin.permEditor.customPermPlaceholder")}
          value={newPermName}
          onChange={(e) => setNewPermName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPermission(newPermName);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addPermission(newPermName)}
          disabled={!newPermName}
        >
          {t("admin.permEditor.addCustom")}
        </Button>
      </div>
    </div>
  );
}
