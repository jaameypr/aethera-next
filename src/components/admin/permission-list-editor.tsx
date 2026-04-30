"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { PERMISSION_DEFINITIONS, PERMISSION_QUICK_PRESETS } from "@/lib/permission-presets";
import type { PermissionEntry } from "@/lib/api/types";
import { useLocale } from "@/context/locale-context";

interface PermissionListEditorProps {
  permissions: PermissionEntry[];
  onChange: (permissions: PermissionEntry[]) => void;
}

export function PermissionListEditor({
  permissions,
  onChange,
}: PermissionListEditorProps) {
  const { t } = useLocale();
  const [newPermName, setNewPermName] = useState("");

  const addPermission = (name: string) => {
    if (!name || permissions.some((p) => p.name === name)) return;
    onChange([...permissions, { name, allow: true }]);
    setNewPermName("");
  };

  const removePermission = (index: number) => {
    onChange(permissions.filter((_, i) => i !== index));
  };

  const togglePermission = (index: number) => {
    const updated = [...permissions];
    updated[index] = { ...updated[index], allow: !updated[index].allow };
    onChange(updated);
  };

  const applyPreset = (presetName: string) => {
    const preset = PERMISSION_QUICK_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      onChange(preset.permissions);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick presets */}
      <div>
        <Label className="mb-2 block text-xs text-zinc-500">{t("admin.permEditor.quickPresets")}</Label>
        <div className="flex flex-wrap gap-2">
          {PERMISSION_QUICK_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.name)}
              title={preset.description}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Current permissions */}
      <div className="space-y-2">
        <Label className="text-xs text-zinc-500">{t("admin.permEditor.permissions")}</Label>
        {permissions.length === 0 && (
          <p className="text-sm text-zinc-400">{t("admin.permEditor.noPermissions")}</p>
        )}
        {permissions.map((perm, index) => {
          const def = PERMISSION_DEFINITIONS.find((d) => d.name === perm.name);
          return (
            <div
              key={perm.name}
              className="flex items-center gap-3 rounded-md border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <Switch
                checked={perm.allow}
                onCheckedChange={() => togglePermission(index)}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{perm.name}</p>
                {def && (
                  <p className="text-xs text-zinc-500">{def.description}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removePermission(index)}
                className="h-8 w-8 text-zinc-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Add permission */}
      <div className="flex gap-2">
        <Select
          value={newPermName}
          onValueChange={(val) => setNewPermName(val)}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t("admin.permEditor.selectPermission")} />
          </SelectTrigger>
          <SelectContent>
            {PERMISSION_DEFINITIONS.filter(
              (d) => !permissions.some((p) => p.name === d.name),
            ).map((def) => (
              <SelectItem key={def.name} value={def.name}>
                {def.label} ({def.name})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon"
          onClick={() => addPermission(newPermName)}
          disabled={!newPermName}
        >
          <Plus className="h-4 w-4" />
        </Button>
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
