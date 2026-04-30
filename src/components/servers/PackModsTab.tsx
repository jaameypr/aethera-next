"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Ban, Loader2, Search, Package, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { lookupPackModAction, type PackModInfo } from "@/app/(app)/actions/servers";
import { useLocale } from "@/context/locale-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdditionalMod {
  _id: string;
  source: "modrinth" | "curseforge";
  projectId: string;
  slug?: string;
  displayName: string;
  versionId?: string;
  fileId?: string;
}

interface ExcludedMod {
  _id: string;
  displayName: string;
  slug?: string;
  projectId?: string;
  cfExcludeToken?: string;
  filenameToken?: string;
  isOverride?: boolean;
}

// ---------------------------------------------------------------------------
// Add Additional Mod Panel
// ---------------------------------------------------------------------------

function AddAdditionalModPanel({
  serverId,
  source,
  onAdded,
  onCancel,
}: {
  serverId: string;
  source: "modrinth" | "curseforge";
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [versionPin, setVersionPin] = useState("");
  const [found, setFound] = useState<PackModInfo | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [isLooking, startLookup] = useTransition();
  const [isAdding, startAdd] = useTransition();

  function handleLookup() {
    if (!query.trim()) return;
    setFound(null);
    setLookupError("");
    startLookup(async () => {
      const result = await lookupPackModAction({ source, query: query.trim() });
      if (!result.ok) {
        setLookupError(result.error);
        return;
      }
      setFound(result.data);
    });
  }

  function handleAdd() {
    if (!found) return;
    startAdd(async () => {
      const res = await fetch(`/api/servers/${serverId}/pack-mods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          projectId: found.projectId,
          slug: found.slug,
          displayName: found.displayName,
          ...(versionPin.trim() ? (source === "modrinth" ? { versionId: versionPin.trim() } : { fileId: versionPin.trim() }) : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("servers.mods.addFailed"));
        return;
      }
      toast.success(t("servers.mods.added", { name: found.displayName }));
      onAdded();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <p className="text-sm font-medium">
        {source === "modrinth" ? "Modrinth" : "CurseForge"}-Mod hinzufügen
      </p>

      <div className="flex gap-2">
        <Input
          placeholder={source === "modrinth" ? t("servers.mods.modrinthSlugPlaceholder") : t("servers.mods.modrinthProjectIdPlaceholder")}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setFound(null); setLookupError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleLookup} disabled={isLooking || !query.trim()}>
          {isLooking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {lookupError && <p className="text-xs text-red-500">{lookupError}</p>}

      {found && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/40">
            {found.iconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={found.iconUrl} alt="" className="h-8 w-8 rounded" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-emerald-700 dark:text-emerald-400">{found.displayName}</p>
              <p className="truncate text-xs text-emerald-600 dark:text-emerald-500">{found.slug}</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="version-pin" className="text-xs">
              {source === "modrinth" ? "Version-ID pinnen" : "Datei-ID pinnen"}{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </Label>
            <Input
              id="version-pin"
              className="h-8 text-xs"
              placeholder={source === "modrinth" ? "IIJJKKLL" : "12345678"}
              value={versionPin}
              onChange={(e) => setVersionPin(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleAdd} disabled={!found || isAdding}>
          {isAdding && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Hinzufügen
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Exclusion Panel
// ---------------------------------------------------------------------------

function AddExclusionPanel({
  serverId,
  packType,
  onAdded,
  onCancel,
}: {
  serverId: string;
  packType: "curseforge" | "modrinth";
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [isOverride, setIsOverride] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!displayName.trim() || !token.trim()) return;
    startTransition(async () => {
      const body =
        packType === "curseforge"
          ? { displayName: displayName.trim(), cfExcludeToken: token.trim(), isOverride }
          : { displayName: displayName.trim(), filenameToken: token.trim(), isOverride };

      const res = await fetch(`/api/servers/${serverId}/pack-mods/excluded`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t("servers.mods.excludeFailed"));
        return;
      }
      toast.success(t("servers.mods.excluded", { name: displayName }));
      onAdded();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <p className="text-sm font-medium">Pack-Mod ausschließen</p>

      <div className="space-y-1.5">
        <Label htmlFor="excl-name" className="text-xs">Anzeigename</Label>
        <Input
          id="excl-name"
          className="h-8 text-xs"
          placeholder={t("servers.mods.curseforgeSlugPlaceholder")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excl-token" className="text-xs">
          {packType === "curseforge"
            ? "CurseForge-Slug oder Projekt-ID (CF_EXCLUDE_MODS)"
            : "Dateiname-Token (MODRINTH_EXCLUDE_FILES)"}
        </Label>
        <Input
          id="excl-token"
          className="h-8 font-mono text-xs"
          placeholder={packType === "curseforge" ? t("servers.mods.curseforgeProjectIdPlaceholder") : "jei- oder jei-1.20.1"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <p className="text-xs text-zinc-400">
          {packType === "modrinth"
            ? "Teilstring des Dateinamens aus /data/mods, z.B. \"jei-\" schließt alle JEI-Dateien aus"
            : "Slug oder numerische ID des CurseForge-Projekts"}
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={isOverride}
          onCheckedChange={(v) => setIsOverride(!!v)}
        />
        <span>Override-Datei ausschließen ({packType === "curseforge" ? "CF_OVERRIDES_EXCLUSIONS" : "MODRINTH_OVERRIDES_EXCLUSIONS"})</span>
      </label>

      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending || !displayName.trim() || !token.trim()}>
          {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Ausschließen
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PackModsTab({
  serverId,
  packType,
}: {
  serverId: string;
  packType: "curseforge" | "modrinth";
}) {
  const { t } = useLocale();
  const [additionalMods, setAdditionalMods] = useState<AdditionalMod[]>([]);
  const [excludedMods, setExcludedMods] = useState<ExcludedMod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMod, setShowAddMod] = useState(false);
  const [showAddExcl, setShowAddExcl] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetchData();
  }, [serverId]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/pack-mods`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAdditionalMods(data.additionalMods ?? []);
      setExcludedMods(data.excludedPackMods ?? []);
    } catch {
      toast.error(t("servers.mods.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  function removeAdditionalMod(modId: string, name: string) {
    startTransition(async () => {
      const res = await fetch(`/api/servers/${serverId}/pack-mods/additional/${modId}`, { method: "DELETE" });
      if (!res.ok) { toast.error(t("servers.mods.removeFailed")); return; }
      toast.success(t("servers.mods.removed", { name }));
      fetchData();
    });
  }

  function removeExclusion(modId: string, name: string) {
    startTransition(async () => {
      const res = await fetch(`/api/servers/${serverId}/pack-mods/excluded/${modId}`, { method: "DELETE" });
      if (!res.ok) { toast.error(t("servers.mods.excludeRemoveFailed")); return; }
      toast.success(t("servers.mods.excludeRemoved", { name }));
      fetchData();
    });
  }

  const sourceLabel = packType === "modrinth" ? "Modrinth" : "CurseForge";

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        <p>
          <span className="font-medium">{sourceLabel}-Pack</span> — Mods werden vom Pack bereitgestellt und bei jedem Start vom Image synchronisiert.
          Die Konfiguration unten wird bei jedem Start neu in die Container-Umgebung gerendert.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Lade…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Preinstalled / Exclusions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageX className="h-4 w-4 text-zinc-500" />
                Vorinstalliert (Pack)
              </CardTitle>
              {!showAddExcl && (
                <Button variant="outline" size="sm" onClick={() => setShowAddExcl(true)}>
                  <Ban className="mr-1.5 h-3.5 w-3.5" />
                  Ausschließen
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-zinc-400">
                Pack-Mods werden vom {sourceLabel}-Image verwaltet. Ausschlüsse verhindern die Installation eines bestimmten Mods dauerhaft — auch nach Neustart oder Recreate.
              </p>

              {showAddExcl && (
                <AddExclusionPanel
                  serverId={serverId}
                  packType={packType}
                  onAdded={() => { setShowAddExcl(false); fetchData(); }}
                  onCancel={() => setShowAddExcl(false)}
                />
              )}

              {excludedMods.length === 0 ? (
                <p className="text-sm text-zinc-500">Keine Ausschlüsse konfiguriert</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {excludedMods.map((mod) => (
                    <li key={mod._id} className="flex items-center justify-between py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={cn("truncate text-sm font-medium text-zinc-500 line-through")}>
                            {mod.displayName}
                          </p>
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {mod.isOverride ? "Override" : "Ausgeschlossen"}
                          </Badge>
                        </div>
                        <p className="font-mono text-xs text-zinc-400">
                          {mod.cfExcludeToken ?? mod.filenameToken}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() => removeExclusion(mod._id, mod.displayName)}
                        title={t("servers.mods.removeExclusionTooltip")}
                      >
                        <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Additional mods */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-zinc-500" />
                Zusätzliche Mods
              </CardTitle>
              {!showAddMod && (
                <Button variant="outline" size="sm" onClick={() => setShowAddMod(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Hinzufügen
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-zinc-400">
                Diese Mods werden als{" "}
                <span className="font-mono">{packType === "modrinth" ? "MODRINTH_PROJECTS" : "CURSEFORGE_FILES"}</span>{" "}
                bei jedem Start automatisch installiert und sind vom Pack unabhängig.
              </p>

              {showAddMod && (
                <AddAdditionalModPanel
                  serverId={serverId}
                  source={packType}
                  onAdded={() => { setShowAddMod(false); fetchData(); }}
                  onCancel={() => setShowAddMod(false)}
                />
              )}

              {additionalMods.length === 0 ? (
                <p className="text-sm text-zinc-500">Keine zusätzlichen Mods konfiguriert</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {additionalMods.map((mod) => (
                    <li key={mod._id} className="flex items-center justify-between py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{mod.displayName}</p>
                          <Badge variant="outline" className="shrink-0 text-xs">
                            Zusätzlich
                          </Badge>
                        </div>
                        <p className="font-mono text-xs text-zinc-400">
                          {mod.slug ?? mod.projectId}
                          {(mod.versionId ?? mod.fileId) ? ` @ ${mod.versionId ?? mod.fileId}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isPending}
                        onClick={() => removeAdditionalMod(mod._id, mod.displayName)}
                      >
                        <Trash2 className="h-4 w-4 text-zinc-400 hover:text-red-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
