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
import {
  createServerAction,
  checkPortAction,
  initializeBlueprintAction,
} from "@/app/(app)/actions/servers";
import { JVM_FLAG_PRESETS, type JvmPreset } from "@/lib/constants/jvm-presets";
import JvmPresetSelector from "@/components/servers/JvmPresetSelector";
import {
  BackupSelector,
  type BackupSelection,
} from "@/components/backups/backup-selector";

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

type Runtime = "minecraft" | "hytale";
type ModLoader = "vanilla" | "forge" | "fabric" | "paper" | "spigot" | "purpur";

const MOD_LOADERS: { value: ModLoader; label: string }[] = [
  { value: "vanilla", label: "Vanilla" },
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "paper", label: "Paper" },
  { value: "spigot", label: "Spigot" },
  { value: "purpur", label: "Purpur" },
];

const STEPS = [
  { title: "Basis", icon: Server, description: "Name und Runtime wählen" },
  { title: "Version", icon: Settings, description: "Version und Mod-Loader konfigurieren" },
  { title: "Ressourcen", icon: Cpu, description: "RAM und Port festlegen" },
  { title: "Bestätigung", icon: Rocket, description: "Zusammenfassung prüfen" },
];

// ---------------------------------------------------------------------------
// Zod schemas per step
// ---------------------------------------------------------------------------

const stepSchemas = [
  z.object({
    name: z.string().min(3, "Mindestens 3 Zeichen erforderlich"),
    identifier: z
      .string()
      .min(2, "Mindestens 2 Zeichen")
      .max(40, "Maximal 40 Zeichen")
      .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche"),
    runtime: z.enum(["minecraft", "hytale"]),
  }),
  z.object({
    version: z.string().optional(),
    modLoader: z.enum(["vanilla", "forge", "fabric", "paper", "spigot", "purpur"]),
  }),
  z.object({
    memory: z.number().min(512, "Mindestens 512 MB"),
    port: z.number().min(1024, "Mindestens 1024").max(65535, "Maximal 65535"),
  }),
  z.object({}),
];

// ---------------------------------------------------------------------------
// State / Reducer
// ---------------------------------------------------------------------------

const DEFAULT_JVM_PRESET = JVM_FLAG_PRESETS.find((p) => p.id === "aikars")!;

interface WizardState {
  step: number;
  direction: 1 | -1;
  name: string;
  identifier: string;
  identifierEdited: boolean;
  runtime: Runtime;
  version: string;
  modLoader: ModLoader;
  memory: number;
  port: number;
  portStatus: "idle" | "checking" | "available" | "taken";
  jvmPresetId: string;
  javaArgs: string;
  autoStart: boolean;
  backupSelection: BackupSelection | null;
  errors: Record<string, string>;
  submitting: boolean;
}

type WizardAction =
  | { type: "SET_FIELD"; field: keyof WizardState; value: unknown }
  | { type: "SET_NAME"; value: string }
  | { type: "SET_IDENTIFIER"; value: string }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | { type: "SET_PORT_STATUS"; status: WizardState["portStatus"] }
  | { type: "SET_JVM_PRESET"; preset: JvmPreset }
  | { type: "SET_JAVA_ARGS"; value: string }
  | { type: "SET_BACKUP"; selection: BackupSelection | null }
  | { type: "SET_SUBMITTING"; value: boolean };

const initialState: WizardState = {
  step: 0,
  direction: 1,
  name: "",
  identifier: "",
  identifierEdited: false,
  runtime: "minecraft",
  version: "",
  modLoader: "vanilla",
  memory: 2048,
  port: 25565,
  portStatus: "idle",
  jvmPresetId: DEFAULT_JVM_PRESET.id,
  javaArgs: DEFAULT_JVM_PRESET.flags,
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
    case "SET_FIELD":
      return { ...state, [action.field]: action.value, errors: {} } as WizardState;
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
// Step 0 — Basis
// ---------------------------------------------------------------------------

function Step0({
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

      <div className="space-y-1.5">
        <Label>Runtime</Label>
        <Select
          value={state.runtime}
          onValueChange={(v) => dispatch({ type: "SET_FIELD", field: "runtime", value: v as Runtime })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="minecraft">🟫 Minecraft</SelectItem>
            <SelectItem value="hytale">🟦 Hytale</SelectItem>
          </SelectContent>
        </Select>
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

function Step1({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const [jvmOpen, setJvmOpen] = useState(false);
  const isMinecraft = state.runtime === "minecraft";

  return (
    <div className="space-y-4">
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

      {isMinecraft && (
        <div className="space-y-1.5">
          <Label>Mod-Loader</Label>
          <div className="grid grid-cols-3 gap-2">
            {MOD_LOADERS.map((loader) => (
              <button
                key={loader.value}
                type="button"
                onClick={() => dispatch({ type: "SET_FIELD", field: "modLoader", value: loader.value })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  state.modLoader === loader.value
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
                )}
              >
                {loader.label}
              </button>
            ))}
          </div>
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

function Step2({
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
// Step 3 — Bestätigung
// ---------------------------------------------------------------------------

function Step3({ state }: { state: WizardState }) {
  const rows = [
    { label: "Name", value: state.name },
    { label: "Identifier", value: state.identifier },
    { label: "Runtime", value: state.runtime },
    { label: "Version", value: state.version || "latest" },
    ...(state.runtime === "minecraft" ? [{ label: "Mod-Loader", value: state.modLoader }] : []),
    { label: "RAM", value: formatMemory(state.memory) },
    { label: "Port", value: String(state.port) },
    ...(state.runtime === "minecraft" && state.jvmPresetId !== "minimal"
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
    if (state.step !== 2) return;
    const timer = setTimeout(() => checkPort(state.port), 500);
    return () => clearTimeout(timer);
  }, [state.port, state.step, checkPort]);

  function validateStep(): boolean {
    const schema = stepSchemas[state.step];
    if (!schema) return true;

    const data =
      state.step === 0
        ? { name: state.name, identifier: state.identifier, runtime: state.runtime }
        : state.step === 1
          ? { version: state.version, modLoader: state.modLoader }
          : state.step === 2
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
        const image =
          state.runtime === "minecraft"
            ? "itzg/minecraft-server"
            : "zacheri/hytale-server";

        const input = {
          name: state.name,
          identifier: state.identifier,
          runtime: state.runtime,
          image,
          tag: "stable",
          port: state.port,
          memory: state.memory,
          version: state.version || undefined,
          modLoader: state.modLoader,
          javaArgs: state.javaArgs || undefined,
          autoStart: state.backupSelection ? false : state.autoStart,
        };

        const result = blueprintId
          ? await initializeBlueprintAction({
              blueprintId,
              projectKey,
              input,
              autoStartNow: state.backupSelection ? false : state.autoStart,
            })
          : await createServerAction({
              projectKey,
              input,
              autoStartNow: state.backupSelection ? false : state.autoStart,
            });

        // Restore backup to the newly created server
        if (state.backupSelection && state.backupSelection.components.length > 0) {
          try {
            const restoreRes = await fetch(
              `/api/backups/${state.backupSelection.backupId}/restore-to/${result.serverId}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ components: state.backupSelection.components }),
              },
            );
            if (!restoreRes.ok) {
              const data = await restoreRes.json().catch(() => ({}));
              toast.error(`Backup-Wiederherstellung fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
            } else {
              toast.success("Backup wiederhergestellt!");
            }
          } catch {
            toast.error("Backup-Wiederherstellung fehlgeschlagen");
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
            {state.step === 2 && <Step2 state={state} dispatch={dispatch} maxRam={maxRam ?? 32768} />}
            {state.step === 3 && <Step3 state={state} />}
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
