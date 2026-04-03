"use client";

import { useReducer, useState, useEffect, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Rocket,
  Server,
  Cpu,
  Settings,
  Globe,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { uploadChunked, type UploadProgress } from "@/lib/utils/upload-chunked";
import { inferJavaVersion, JAVA_VERSIONS } from "@/lib/utils/java-version";
import {
  resolvePackAction,
  createServerAction,
  checkPortAction,
  initializeBlueprintAction,
} from "@/app/(app)/actions/servers";
import { JVM_FLAG_PRESETS, type JvmPreset } from "@/lib/constants/jvm-presets";
import JvmPresetSelector from "@/components/servers/JvmPresetSelector";
import { BackupSelector, type BackupSelection } from "@/components/backups/backup-selector";
import {
  SERVER_TYPE_MAP,
  SERVER_TYPE_ORDER,
  getRuntimeFromType,
  type ServerType,
} from "@/lib/config/server-types";
import type { IPackReference } from "@/lib/db/models/server";
import type { ResolvedPackInfo } from "@/lib/services/pack-resolution.service";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { title: "Server-Typ", icon: Server, description: "Servertyp wählen" },
  { title: "Basis", icon: Settings, description: "Name und Identifier" },
  { title: "Version", icon: Settings, description: "Version konfigurieren" },
  { title: "Ressourcen", icon: Cpu, description: "RAM und Port festlegen" },
  { title: "Einstellungen", icon: Globe, description: "Welt und Server konfigurieren" },
  { title: "Bestätigung", icon: Rocket, description: "Zusammenfassung prüfen" },
];

// ---------------------------------------------------------------------------
// Zod schemas per step
// ---------------------------------------------------------------------------

const stepSchemas = [
  // Step 0 — Server-Typ
  z.object({ serverType: z.string().min(1, "Servertyp erforderlich") }),
  // Step 1 — Basis
  z.object({
    name: z.string().min(1, "Name erforderlich"),
    identifier: z
      .string()
      .min(1, "Identifier erforderlich")
      .max(40, "Maximal 40 Zeichen")
      .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche"),
  }),
  // Step 2 — Version (optional for pack types)
  z.object({}),
  // Step 3 — Ressourcen
  z.object({
    memory: z.number().min(512, "Mindestens 512 MB"),
    port: z.number().min(1024, "Mindestens 1024").max(65535, "Maximal 65535"),
  }),
  z.object({}),
  z.object({}),
];

// ---------------------------------------------------------------------------
// State / Reducer
// ---------------------------------------------------------------------------

const DEFAULT_JVM_PRESET = JVM_FLAG_PRESETS.find((p) => p.id === "minimal")!;

type Difficulty = "peaceful" | "easy" | "normal" | "hard";
type WorldSource = "generate" | "import" | "backup";

interface WizardState {
  step: number;
  direction: 1 | -1;
  // Step 0 — Server-Typ
  serverType: ServerType;
  packReference: IPackReference;
  packMeta: ResolvedPackInfo | null;
  packResolving: boolean;
  uploadProgress: UploadProgress | null;
  // Step 1 — Basis
  name: string;
  identifier: string;
  identifierEdited: boolean;
  // Step 2 — Version
  version: string;
  // Step 3 — Ressourcen
  memory: number;
  port: number;
  portStatus: "idle" | "checking" | "available" | "taken";
  // JVM
  jvmPresetId: string;
  javaArgs: string;
  javaVersion: string;
  // Step 4 — Einstellungen
  whitelist: boolean;
  maxPlayers: number;
  difficulty: Difficulty;
  motd: string;
  worldSource: WorldSource;
  worldSeed: string;
  worldImportFile: File | null;
  worldBackupSelection: BackupSelection | null;
  // Global
  autoStart: boolean;
  backupSelection: BackupSelection | null;
  errors: Record<string, string>;
  submitting: boolean;
}

type WizardAction =
  | { type: "SET_FIELD"; field: keyof WizardState; value: unknown }
  | { type: "SET_NAME"; value: string }
  | { type: "SET_IDENTIFIER"; value: string }
  | { type: "SET_PACK_REF"; field: keyof IPackReference; value: string }
  | { type: "SET_PACK_META"; meta: ResolvedPackInfo | null }
  | { type: "SET_PACK_RESOLVING"; value: boolean }
  | { type: "SET_UPLOAD_PROGRESS"; progress: UploadProgress | null }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | { type: "SET_PORT_STATUS"; status: WizardState["portStatus"] }
  | { type: "SET_JVM_PRESET"; preset: JvmPreset }
  | { type: "SET_JAVA_ARGS"; value: string }
  | { type: "SET_BACKUP"; selection: BackupSelection | null }
  | { type: "SET_WORLD_FILE"; file: File | null }
  | { type: "SET_WORLD_BACKUP"; selection: BackupSelection | null }
  | { type: "SET_SUBMITTING"; value: boolean };

const initialState: WizardState = {
  step: 0,
  direction: 1,
  serverType: "vanilla",
  packReference: {},
  packMeta: null,
  packResolving: false,
  uploadProgress: null,
  name: "",
  identifier: "",
  identifierEdited: false,
  version: "",
  memory: 2048,
  port: 25565,
  portStatus: "idle",
  jvmPresetId: DEFAULT_JVM_PRESET?.id ?? "minimal",
  javaArgs: DEFAULT_JVM_PRESET?.flags ?? "",
  javaVersion: "21",
  whitelist: true,
  maxPlayers: 20,
  difficulty: "normal",
  motd: "A Aethera Server",
  worldSource: "generate",
  worldSeed: "",
  worldImportFile: null,
  worldBackupSelection: null,
  autoStart: true,
  backupSelection: null,
  errors: {},
  submitting: false,
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_NAME": {
      const name = action.value;
      const identifier = state.identifierEdited ? state.identifier : slugify(name);
      return { ...state, name, identifier, errors: {} };
    }
    case "SET_IDENTIFIER":
      return { ...state, identifier: action.value, identifierEdited: true, errors: {} };
    case "SET_PACK_REF":
      return { ...state, packReference: { ...state.packReference, [action.field]: action.value }, errors: {} };
    case "SET_PACK_META":
      return {
        ...state,
        packMeta: action.meta,
        errors: {},
        javaVersion: action.meta ? inferJavaVersion(action.meta.mcVersion) : state.javaVersion,
      };
    case "SET_PACK_RESOLVING":
      return { ...state, packResolving: action.value };
    case "SET_UPLOAD_PROGRESS":
      return { ...state, uploadProgress: action.progress };
    case "SET_FIELD": {
      const next = { ...state, [action.field]: action.value, errors: {} } as WizardState;
      // Auto-infer java version when minecraft version field changes
      if (action.field === "version") {
        next.javaVersion = inferJavaVersion(action.value as string);
      }
      return next;
    }
    case "NEXT":
      return { ...state, step: state.step + 1, direction: 1, errors: {} };
    case "PREV":
      return { ...state, step: state.step - 1, direction: -1, errors: {} };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "SET_PORT_STATUS":
      return { ...state, portStatus: action.status };
    case "SET_JVM_PRESET": {
      const { preset } = action;
      return {
        ...state,
        jvmPresetId: preset.id,
        javaArgs: preset.id === "custom" ? state.javaArgs : preset.flags,
      };
    }
    case "SET_JAVA_ARGS":
      return { ...state, javaArgs: action.value };
    case "SET_BACKUP":
      return { ...state, backupSelection: action.selection };
    case "SET_WORLD_FILE":
      return { ...state, worldImportFile: action.file };
    case "SET_WORLD_BACKUP":
      return { ...state, worldBackupSelection: action.selection };
    case "SET_SUBMITTING":
      return { ...state, submitting: action.value };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" } as Record<string, string>)[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => (
        <div key={s.title} className="flex flex-1 items-center gap-1">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
              i < current
                ? "bg-emerald-500 text-white"
                : i === current
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800",
            )}
          >
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span
            className={cn(
              "hidden text-sm sm:block",
              i === current ? "font-medium text-zinc-900 dark:text-zinc-50" : "text-zinc-400",
            )}
          >
            {s.title}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "h-0.5 flex-1 rounded transition-colors",
                i < current ? "bg-emerald-500" : "bg-zinc-200 dark:bg-zinc-800",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 0 — Server-Typ
// ---------------------------------------------------------------------------

function Step0({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const typeConfig = SERVER_TYPE_MAP[state.serverType];
  const groups: Array<{ label: string; types: ServerType[] }> = [
    { label: "Vanilla & Plugins", types: ["vanilla", "paper", "spigot", "purpur"] },
    { label: "Mods", types: ["forge", "fabric"] },
    { label: "Modpacks", types: ["curseforge", "modrinth"] },
    { label: "Andere", types: ["hytale"] },
  ];

  async function handleResolve() {
    if (!typeConfig.packSource) return;
    dispatch({ type: "SET_PACK_RESOLVING", value: true });
    dispatch({ type: "SET_ERRORS", errors: {} });
    const result = await resolvePackAction({
      source: typeConfig.packSource,
      reference: state.packReference,
    });
    dispatch({ type: "SET_PACK_RESOLVING", value: false });
    if (!result.ok) {
      dispatch({ type: "SET_ERRORS", errors: { pack: result.error } });
      return;
    }
    dispatch({ type: "SET_PACK_META", meta: result.data });
    if (result.data.packName && !state.identifierEdited) {
      dispatch({ type: "SET_NAME", value: result.data.packName });
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label} className="space-y-1.5">
          <p className="text-xs text-zinc-400">{g.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {g.types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  dispatch({ type: "SET_FIELD", field: "serverType", value: t });
                  dispatch({ type: "SET_PACK_META", meta: null });
                  dispatch({ type: "SET_FIELD", field: "packReference", value: {} });
                }}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm transition-colors",
                  state.serverType === t
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600",
                )}
              >
                {SERVER_TYPE_MAP[t].label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Pack reference inputs */}
      {typeConfig.isPack && (
        <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
          <p className="text-sm font-medium">
            {state.serverType === "curseforge" ? "CurseForge-Modpack" : "Modrinth-Modpack"}
          </p>

          {state.serverType === "curseforge" && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-cf-slug">Slug oder Projekt-ID</Label>
                <Input
                  id="w-cf-slug"
                  placeholder="all-the-mods-9"
                  value={state.packReference.slug ?? ""}
                  onChange={(e) => dispatch({ type: "SET_PACK_REF", field: "slug", value: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-cf-file">Datei-ID <span className="text-zinc-400 font-normal">(optional, für spez. Version)</span></Label>
                <Input
                  id="w-cf-file"
                  placeholder="12345678"
                  value={state.packReference.fileId ?? ""}
                  onChange={(e) => dispatch({ type: "SET_PACK_REF", field: "fileId", value: e.target.value })}
                />
              </div>
            </div>
          )}

          {state.serverType === "modrinth" && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-mr-id">Projekt-ID oder Slug</Label>
                <Input
                  id="w-mr-id"
                  placeholder="fabulously-optimized"
                  value={state.packReference.projectId ?? ""}
                  onChange={(e) => dispatch({ type: "SET_PACK_REF", field: "projectId", value: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-mr-ver">Version-ID <span className="text-zinc-400 font-normal">(optional)</span></Label>
                <Input
                  id="w-mr-ver"
                  placeholder="IIJJKKLL"
                  value={state.packReference.versionId ?? ""}
                  onChange={(e) => dispatch({ type: "SET_PACK_REF", field: "versionId", value: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Oder .mrpack-Datei hochladen</Label>
                <input
                  type="file"
                  accept=".mrpack"
                  disabled={state.packResolving}
                  className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm disabled:opacity-50 dark:file:bg-zinc-800 dark:text-zinc-400"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    dispatch({ type: "SET_PACK_RESOLVING", value: true });
                    dispatch({ type: "SET_UPLOAD_PROGRESS", progress: null });
                    dispatch({ type: "SET_ERRORS", errors: {} });
                    try {
                      const { status, body } = await uploadChunked(
                        file,
                        "/api/servers/mrpack/chunk",
                        "/api/servers/mrpack/process",
                        {},
                        (p) => dispatch({ type: "SET_UPLOAD_PROGRESS", progress: p }),
                      );
                      if (status < 200 || status >= 300) {
                        let msg = "Upload fehlgeschlagen";
                        try { msg = (JSON.parse(body) as { error?: string }).error ?? msg; } catch { /* noop */ }
                        dispatch({ type: "SET_ERRORS", errors: { pack: msg } });
                        return;
                      }
                      const result = JSON.parse(body) as { ok: boolean; uploadId?: string; data?: ResolvedPackInfo; error?: string };
                      if (!result.ok || !result.data) {
                        dispatch({ type: "SET_ERRORS", errors: { pack: result.error ?? "Unbekannter Fehler" } });
                        return;
                      }
                      dispatch({ type: "SET_PACK_META", meta: result.data });
                      // Store the upload ID and the local container path so MODRINTH_MODPACK gets set
                      if (result.uploadId) {
                        dispatch({ type: "SET_PACK_REF", field: "mrpackUploadId", value: result.uploadId });
                        dispatch({ type: "SET_PACK_REF", field: "mrpackUrl", value: "/data/pack.mrpack" });
                      }
                      if (result.data.packName && !state.identifierEdited) {
                        dispatch({ type: "SET_NAME", value: result.data.packName });
                      }
                    } catch (err) {
                      dispatch({ type: "SET_ERRORS", errors: { pack: err instanceof Error ? err.message : "Upload fehlgeschlagen" } });
                    } finally {
                      dispatch({ type: "SET_PACK_RESOLVING", value: false });
                      dispatch({ type: "SET_UPLOAD_PROGRESS", progress: null });
                    }
                  }}
                />
                {state.uploadProgress && (
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full bg-zinc-900 transition-all duration-300 ease-out dark:bg-zinc-100"
                        style={{ width: `${state.uploadProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-center text-xs text-zinc-500">
                      {(state.uploadProgress.loaded / 1024 / 1024).toFixed(1)} MB /{" "}
                      {(state.uploadProgress.total / 1024 / 1024).toFixed(1)} MB ({state.uploadProgress.percent}%)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {state.errors.pack && <p className="text-xs text-red-500">{state.errors.pack}</p>}

          {state.packMeta ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">✓ {state.packMeta.packName}</p>
              <p className="text-emerald-600 dark:text-emerald-500">
                MC {state.packMeta.mcVersion} · {state.packMeta.loader}
                {state.packMeta.loaderVersion ? ` ${state.packMeta.loaderVersion}` : ""}
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResolve}
              disabled={
                state.packResolving ||
                (state.serverType === "curseforge" && !state.packReference.slug && !state.packReference.projectId) ||
                (state.serverType === "modrinth" && !state.packReference.projectId && !state.packReference.slug)
              }
            >
              {state.packResolving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              )}
              Pack auflösen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Basis
// ---------------------------------------------------------------------------

function Step1({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="w-name">Server-Name</Label>
        <Input
          id="w-name"
          placeholder="Mein Minecraft Server"
          value={state.name}
          onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
          autoFocus
        />
        {state.errors.name && (
          <p className="text-xs text-red-500">{state.errors.name}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-identifier">Identifier</Label>
        <Input
          id="w-identifier"
          placeholder="mein-server"
          className="font-mono"
          value={state.identifier}
          onChange={(e) =>
            dispatch({ type: "SET_IDENTIFIER", value: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })
          }
        />
        {state.errors.identifier ? (
          <p className="text-xs text-red-500">{state.errors.identifier}</p>
        ) : (
          <p className="text-xs text-zinc-500">
            Eindeutiger Name für Docker-Container und Dateisystem
          </p>
        )}
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <BackupSelector
          selection={state.backupSelection}
          onSelectionChange={(sel) => dispatch({ type: "SET_BACKUP", selection: sel })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Version
// ---------------------------------------------------------------------------

// Step2 (renamed from old Step1)
function Step2Version({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const [jvmOpen, setJvmOpen] = useState(false);
  const typeConfig = SERVER_TYPE_MAP[state.serverType];
  const isPack = typeConfig.isPack;
  const isMinecraft = getRuntimeFromType(state.serverType) === "minecraft";

  return (
    <div className="space-y-4">
      {isPack && state.packMeta ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1 dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Aufgelöstes Modpack</p>
          <p className="text-sm text-emerald-600 dark:text-emerald-500">
            Minecraft {state.packMeta.mcVersion} · {state.packMeta.loader}
            {state.packMeta.loaderVersion ? ` ${state.packMeta.loaderVersion}` : ""}
          </p>
          <p className="text-xs text-zinc-500">Version wird automatisch aus dem Pack übernommen.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="w-version">{isMinecraft ? "Minecraft-Version" : "Version"}</Label>
          <Input
            id="w-version"
            placeholder="latest"
            value={state.version}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "version", value: e.target.value })}
          />
          <p className="text-xs text-zinc-500">Leer lassen für die neueste Version</p>
        </div>
      )}

      {isMinecraft && (
        <div className="space-y-1.5">
          <Label>Java-Version</Label>
          <div className="flex flex-wrap gap-2">
            {JAVA_VERSIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => dispatch({ type: "SET_FIELD", field: "javaVersion", value: v })}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm transition-colors",
                  state.javaVersion === v
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500",
                )}
              >
                Java {v}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">
            {isPack && state.packMeta
              ? `Automatisch erkannt aus MC ${state.packMeta.mcVersion}. Kann manuell überschrieben werden.`
              : "Automatisch angepasst wenn eine Version eingetragen wird."}
          </p>
        </div>
      )}

      {isMinecraft && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setJvmOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span>JVM Flags</span>
            <svg
              className={cn("h-4 w-4 transition-transform", jvmOpen && "rotate-180")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {jvmOpen && (
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
              <JvmPresetSelector
                memory={state.memory}
                selectedPresetId={state.jvmPresetId}
                onPresetChange={(presetId, flags) =>
                  dispatch({ type: "SET_JVM_PRESET", preset: { id: presetId, flags } as JvmPreset })
                }
                javaArgs={state.javaArgs}
                onJavaArgsChange={(value) => dispatch({ type: "SET_JAVA_ARGS", value })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Ressourcen
// ---------------------------------------------------------------------------

function Step3Resources({
  state,
  dispatch,
  maxRam = 32768,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  maxRam?: number;
}) {
  return (
    <div className="space-y-6">
      {/* RAM */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>RAM</Label>
          <span className="font-mono text-sm font-medium">{formatMemory(state.memory)}</span>
        </div>
        <Slider
          min={512}
          max={Math.max(512, maxRam)}
          step={512}
          value={[state.memory]}
          onValueChange={([v]) => dispatch({ type: "SET_FIELD", field: "memory", value: v })}
        />
        <div className="flex justify-between text-xs text-zinc-400">
          <span>512 MB</span>
          <span>{formatMemory(Math.max(512, maxRam))}</span>
        </div>
        {state.errors.memory && (
          <p className="text-xs text-red-500">{state.errors.memory}</p>
        )}
      </div>

      {/* Port */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="w-port">Port</Label>
          <div className="relative">
            <Input
              id="w-port"
              type="number"
              value={state.port}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "port", value: Number(e.target.value) })}
              className="pr-8"
            />
            {state.portStatus === "checking" && (
              <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
            )}
            {state.portStatus === "available" && (
              <CheckCircle2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
            )}
            {state.portStatus === "taken" && (
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-default text-red-500" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Dieser Port ist bereits belegt. Wähle einen anderen Port.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {state.portStatus === "taken" && (
            <p className="text-xs text-red-500">Port ist bereits belegt</p>
          )}
          {state.errors.port && (
            <p className="text-xs text-red-500">{state.errors.port}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Einstellungen (Welt & Server)
// ---------------------------------------------------------------------------

function Step4Settings({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}){
  const isMinecraft = getRuntimeFromType(state.serverType) === "minecraft";
  const showWorld =
    isMinecraft &&
    (!state.backupSelection || !state.backupSelection.components.includes("world"));

  return (
    <div className="space-y-5">
      {isMinecraft && (
        <>
          {/* MOTD */}
          <div className="space-y-1.5">
            <Label htmlFor="w-motd">Server-Beschreibung (MOTD)</Label>
            <Input
              id="w-motd"
              value={state.motd}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "motd", value: e.target.value })}
              placeholder="A Aethera Server"
            />
          </div>

          {/* maxPlayers + difficulty */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="w-maxplayers">Max. Spieler</Label>
              <Input
                id="w-maxplayers"
                type="number"
                min={1}
                max={1000}
                value={state.maxPlayers}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "maxPlayers", value: Math.max(1, Number(e.target.value)) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Schwierigkeitsgrad</Label>
              <Select
                value={state.difficulty}
                onValueChange={(v) =>
                  dispatch({ type: "SET_FIELD", field: "difficulty", value: v as Difficulty })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peaceful">Friedlich</SelectItem>
                  <SelectItem value="easy">Einfach</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="hard">Schwer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Whitelist */}
          <label className="flex items-center gap-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-700 cursor-pointer">
            <Checkbox
              checked={state.whitelist}
              onCheckedChange={(v) =>
                dispatch({ type: "SET_FIELD", field: "whitelist", value: !!v })
              }
            />
            <div>
              <span className="text-sm font-medium">Whitelist aktivieren</span>
              <p className="text-xs text-zinc-500">Nur eingeladene Spieler können beitreten</p>
            </div>
          </label>
        </>
      )}

      {/* World Section */}
      {showWorld && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-zinc-500" />
            <Label className="text-sm font-semibold">Welt</Label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(["generate", "import", "backup"] as WorldSource[]).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => dispatch({ type: "SET_FIELD", field: "worldSource", value: src })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  state.worldSource === src
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
                )}
              >
                {src === "generate" ? "Generieren" : src === "import" ? "Importieren" : "Backup"}
              </button>
            ))}
          </div>

          {state.worldSource === "generate" && (
            <div className="space-y-1.5">
              <Label htmlFor="w-seed">Seed <span className="text-zinc-400 font-normal">(optional)</span></Label>
              <Input
                id="w-seed"
                placeholder="Zufällig"
                value={state.worldSeed}
                onChange={(e) => dispatch({ type: "SET_FIELD", field: "worldSeed", value: e.target.value })}
              />
            </div>
          )}

          {state.worldSource === "import" && (
            <div className="space-y-1.5">
              <Label>Welt-ZIP hochladen</Label>
              <input
                type="file"
                accept=".zip"
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:text-zinc-400"
                onChange={(e) =>
                  dispatch({ type: "SET_WORLD_FILE", file: e.target.files?.[0] ?? null })
                }
              />
              {state.worldImportFile && (
                <p className="text-xs text-emerald-600">{state.worldImportFile.name} ausgewählt</p>
              )}
            </div>
          )}

          {state.worldSource === "backup" && (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <BackupSelector
                selection={state.worldBackupSelection}
                onSelectionChange={(sel) => dispatch({ type: "SET_WORLD_BACKUP", selection: sel })}
              />
            </div>
          )}
        </div>
      )}

      {!isMinecraft && !showWorld && (
        <p className="text-sm text-zinc-500">Keine zusätzlichen Einstellungen für diese Runtime verfügbar.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Bestätigung
// ---------------------------------------------------------------------------

function Step5Confirm({ state }: { state: WizardState }){
  const typeConfig = SERVER_TYPE_MAP[state.serverType];
  const isMinecraft = getRuntimeFromType(state.serverType) === "minecraft";
  const showWorldInfo =
    isMinecraft &&
    (!state.backupSelection || !state.backupSelection.components.includes("world"));

  const worldDesc =
    state.worldSource === "generate"
      ? state.worldSeed ? `Generiert (Seed: ${state.worldSeed})` : "Generiert (zufällig)"
      : state.worldSource === "import"
        ? state.worldImportFile ? `Import: ${state.worldImportFile.name}` : "Import (keine Datei)"
        : state.worldBackupSelection
          ? `Backup: ${state.worldBackupSelection.backupName}`
          : "Backup (nicht gewählt)";

  const rows = [
    { label: "Name", value: state.name },
    { label: "Identifier", value: state.identifier },
    { label: "Servertyp", value: typeConfig.label },
    ...(state.packMeta
      ? [
          { label: "MC-Version", value: state.packMeta.mcVersion },
          { label: "Loader", value: `${state.packMeta.loader}${state.packMeta.loaderVersion ? ` ${state.packMeta.loaderVersion}` : ""}` },
        ]
      : [{ label: "Version", value: state.version || "latest" }]),
    { label: "RAM", value: formatMemory(state.memory) },
    { label: "Port", value: String(state.port) },
    ...(isMinecraft ? [
      { label: "MOTD", value: state.motd },
      { label: "Max. Spieler", value: String(state.maxPlayers) },
      { label: "Schwierigkeit", value: state.difficulty },
      { label: "Whitelist", value: state.whitelist ? "Ja" : "Nein" },
    ] : []),
    ...(showWorldInfo ? [{ label: "Welt", value: worldDesc }] : []),
    ...(isMinecraft && state.jvmPresetId !== "minimal"
      ? [{ label: "JVM Preset", value: JVM_FLAG_PRESETS.find((p) => p.id === state.jvmPresetId)?.label ?? state.jvmPresetId }]
      : []),
    ...(state.backupSelection
      ? [{ label: "Backup", value: `${state.backupSelection.backupName} (${state.backupSelection.components.join(", ")})` }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={cn(
              "flex items-center justify-between px-4 py-2.5 text-sm",
              i < rows.length - 1 ? "border-b border-zinc-100 dark:border-zinc-800" : "",
            )}
          >
            <span className="text-zinc-500">{row.label}</span>
            <span className="max-w-[60%] truncate text-right font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};

interface Props {
  projectKey: string;
  blueprintId?: string;
  maxRam?: number;
}

export function CreateServerWizard({ projectKey, blueprintId, maxRam }: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    memory: Math.min(initialState.memory, maxRam ?? 32768),
  });
  const [isPending, startTransition] = useTransition();

  const checkPort = useCallback(async (port: number) => {
    if (port < 1024 || port > 65535) return;
    dispatch({ type: "SET_PORT_STATUS", status: "checking" });
    try {
      const available = await checkPortAction({ port });
      dispatch({ type: "SET_PORT_STATUS", status: available ? "available" : "taken" });
    } catch {
      dispatch({ type: "SET_PORT_STATUS", status: "idle" });
    }
  }, []);

  useEffect(() => {
    if (state.step !== 3) return;
    const timer = setTimeout(() => checkPort(state.port), 500);
    return () => clearTimeout(timer);
  }, [state.port, state.step, checkPort]);

  function validateStep(): boolean {
    const schema = stepSchemas[state.step];
    if (!schema) return true;

    const data =
      state.step === 0
        ? { serverType: state.serverType }
        : state.step === 1
          ? { name: state.name, identifier: state.identifier }
          : state.step === 3
            ? { memory: state.memory, port: state.port }
            : {};

    const result = schema.safeParse(data);
    if (result.success) return true;

    const errs: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !errs[key]) errs[key] = issue.message;
    }
    dispatch({ type: "SET_ERRORS", errors: errs });
    return false;
  }

  function handleNext() {
    if (validateStep()) dispatch({ type: "NEXT" });
  }

  function handleSubmit() {
    startTransition(async () => {
      dispatch({ type: "SET_SUBMITTING", value: true });
      try {
        const runtime = getRuntimeFromType(state.serverType);
        const image =
          runtime === "minecraft"
            ? "itzg/minecraft-server"
            : "zacheri/hytale-server";

        const hasWorldBackup =
          state.backupSelection?.components.includes("world") ?? false;
        const needsPostWorldSetup =
          runtime === "minecraft" && !hasWorldBackup;

        const properties: Record<string, string> =
          runtime === "minecraft"
            ? {
                "white-list": String(state.whitelist),
                "max-players": String(state.maxPlayers),
                difficulty: state.difficulty,
                motd: state.motd,
                ...(needsPostWorldSetup &&
                state.worldSource === "generate" &&
                state.worldSeed
                  ? { "level-seed": state.worldSeed }
                  : {}),
              }
            : {};

        const needsPostCreation =
          !!state.backupSelection ||
          (needsPostWorldSetup && state.worldSource !== "generate");

        const input = {
          name: state.name,
          identifier: state.identifier,
          runtime,
          image,
          tag: `java${state.javaVersion}`,
          port: state.port,
          memory: state.memory,
          version: state.packMeta?.mcVersion || state.version || undefined,
          serverType: state.serverType,
          packSource: SERVER_TYPE_MAP[state.serverType].packSource,
          packReference: state.packMeta ? state.packReference : undefined,
          resolvedMinecraftVersion: state.packMeta?.mcVersion,
          resolvedLoader: state.packMeta?.loader,
          resolvedLoaderVersion: state.packMeta?.loaderVersion,
          javaArgs: state.javaArgs || undefined,
          javaVersion: state.javaVersion || undefined,
          autoStart: needsPostCreation ? false : state.autoStart,
          properties,
        };

        const result = blueprintId
          ? await initializeBlueprintAction({
              blueprintId,
              projectKey,
              input,
              autoStartNow: needsPostCreation ? false : state.autoStart,
            })
          : await createServerAction({
              projectKey,
              input,
              autoStartNow: needsPostCreation ? false : state.autoStart,
            });

        // Restore main backup
        if (state.backupSelection && state.backupSelection.components.length > 0) {
          try {
            const res = await fetch(
              `/api/backups/${state.backupSelection.backupId}/restore-to/${result.serverId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ components: state.backupSelection.components }),
              },
            );
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              toast.error(`Backup-Wiederherstellung fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
            } else {
              toast.success("Backup wiederhergestellt!");
            }
          } catch {
            toast.error("Backup-Wiederherstellung fehlgeschlagen");
          }
        }

        // World: import from uploaded ZIP
        if (needsPostWorldSetup && state.worldSource === "import" && state.worldImportFile) {
          try {
            const fd = new FormData();
            fd.append("file", state.worldImportFile);
            await fetch(`/api/servers/${result.serverId}/files/world.zip`, {
              method: "POST",
              body: fd,
            });
            toast.success("Welt hochgeladen!");
          } catch {
            toast.error("Welt-Upload fehlgeschlagen");
          }
        }

        // World: restore from world backup
        if (needsPostWorldSetup && state.worldSource === "backup" && state.worldBackupSelection) {
          try {
            const res = await fetch(
              `/api/backups/${state.worldBackupSelection.backupId}/restore-to/${result.serverId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ components: ["world"] }),
              },
            );
            if (!res.ok) {
              toast.error("Welt-Backup konnte nicht wiederhergestellt werden");
            } else {
              toast.success("Welt aus Backup wiederhergestellt!");
            }
          } catch {
            toast.error("Welt-Backup-Wiederherstellung fehlgeschlagen");
          }
        }

        toast.success("Server erstellt!");
        router.push(`/projects/${projectKey}/servers/${result.serverId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
        dispatch({ type: "SET_SUBMITTING", value: false });
      }
    });
  }

  const isLastStep = state.step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <StepIndicator current={state.step} />

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <AnimatePresence mode="wait" custom={state.direction}>
          <motion.div
            key={state.step}
            custom={state.direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="p-6"
          >
            {state.step === 0 && <Step0 state={state} dispatch={dispatch} />}
            {state.step === 1 && <Step1 state={state} dispatch={dispatch} />}
            {state.step === 2 && <Step2Version state={state} dispatch={dispatch} />}
            {state.step === 3 && <Step3Resources state={state} dispatch={dispatch} maxRam={maxRam ?? 32768} />}
            {state.step === 4 && <Step4Settings state={state} dispatch={dispatch} />}
            {state.step === 5 && <Step5Confirm state={state} />}
          </motion.div>
        </AnimatePresence>

        {/* Auto-start on last step */}
        {isLastStep && (
          <div className="border-t border-zinc-200 px-6 pb-4 pt-3 dark:border-zinc-800">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={state.autoStart}
                onCheckedChange={(v) =>
                  dispatch({ type: "SET_FIELD", field: "autoStart", value: !!v })
                }
              />
              Server sofort starten
            </label>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "PREV" })}
            disabled={state.step === 0 || state.submitting || isPending}
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Zurück
          </Button>

          {isLastStep ? (
            <Button onClick={handleSubmit} disabled={state.submitting || isPending}>
              {state.submitting || isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-1.5 h-4 w-4" />
              )}
              {state.submitting || isPending ? "Erstelle…" : "Server erstellen"}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              Weiter
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
