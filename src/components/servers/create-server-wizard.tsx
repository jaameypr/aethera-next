"use client";

import { useReducer, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Rocket,
  Server,
  Cpu,
  Settings,
  Check,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createServerAction,
  checkPortAction,
  ramRemainingAction,
} from "@/app/(app)/actions/servers";
import { JVM_FLAG_PRESETS, type JvmPreset } from "@/lib/constants/jvm-presets";
import JvmPresetSelector from "@/components/servers/JvmPresetSelector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Runtime = "minecraft" | "hytale";
type ModLoader =
  | "vanilla"
  | "forge"
  | "fabric"
  | "paper"
  | "spigot"
  | "purpur";

interface WizardState {
  step: number;
  direction: 1 | -1;
  // Step 1 — Basis
  name: string;
  identifier: string;
  identifierEdited: boolean;
  runtime: Runtime;
  // Step 2 — Version
  version: string;
  modLoader: ModLoader;
  jvmPresetId: string;
  javaArgs: string;
  // Step 3 — Resources
  memory: number;
  port: number;
  portStatus: "idle" | "checking" | "available" | "taken";
  maxRam: number;
  ramLimitMb: number | null;
  ramUsedMb: number | null;
  // Step 4 — Confirmation
  autoStart: boolean;
  // Global
  errors: Record<string, string>;
}

type WizardAction =
  | { type: "SET_FIELD"; field: keyof WizardState; value: unknown }
  | { type: "SET_NAME"; value: string }
  | { type: "SET_IDENTIFIER"; value: string }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | { type: "SET_PORT_STATUS"; status: WizardState["portStatus"] }
  | { type: "SET_MAX_RAM"; value: number }
  | { type: "SET_RAM_QUOTA"; limitMb: number; usedMb: number; availableMb: number }
  | { type: "SET_JVM_PRESET"; preset: JvmPreset }
  | { type: "SET_JAVA_ARGS"; value: string }
  | { type: "RESET" };

const DEFAULT_JVM_PRESET = JVM_FLAG_PRESETS.find((p) => p.id === "aikars")!;

const INITIAL_STATE: WizardState = {
  step: 0,
  direction: 1,
  name: "",
  identifier: "",
  identifierEdited: false,
  runtime: "minecraft",
  version: "",
  modLoader: "vanilla",
  jvmPresetId: DEFAULT_JVM_PRESET.id,
  javaArgs: DEFAULT_JVM_PRESET.flags,
  memory: 2048,
  port: 25565,
  portStatus: "idle",
  maxRam: 8192,
  ramLimitMb: null,
  ramUsedMb: null,
  autoStart: false,
  errors: {},
};

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => {
      const map: Record<string, string> = {
        ä: "ae",
        ö: "oe",
        ü: "ue",
        ß: "ss",
      };
      return map[c] ?? c;
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_NAME": {
      const name = action.value;
      const identifier = state.identifierEdited
        ? state.identifier
        : slugify(name);
      return { ...state, name, identifier, errors: {} };
    }
    case "SET_IDENTIFIER":
      return {
        ...state,
        identifier: action.value,
        identifierEdited: true,
        errors: {},
      };
    case "SET_FIELD":
      return {
        ...state,
        [action.field]: action.value,
        errors: {},
      } as WizardState;
    case "NEXT":
      return { ...state, step: state.step + 1, direction: 1, errors: {} };
    case "PREV":
      return { ...state, step: state.step - 1, direction: -1, errors: {} };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "SET_PORT_STATUS":
      return { ...state, portStatus: action.status };
    case "SET_MAX_RAM":
      return {
        ...state,
        maxRam: action.value,
        memory: Math.min(state.memory, action.value),
      };
    case "SET_RAM_QUOTA": {
      const { limitMb, usedMb, availableMb } = action;
      const hasQuota = limitMb > 0;
      return {
        ...state,
        ramLimitMb: hasQuota ? limitMb : null,
        ramUsedMb: hasQuota ? usedMb : null,
        maxRam: hasQuota ? Math.min(availableMb, 32768) : state.maxRam,
        memory: hasQuota
          ? Math.min(state.memory, Math.min(availableMb, 32768))
          : state.memory,
      };
    }
    case "SET_JVM_PRESET": {
      const { preset } = action;
      return {
        ...state,
        jvmPresetId: preset.id,
        // For custom, keep whatever javaArgs the user had (or prior preset flags)
        javaArgs: preset.id === "custom" ? state.javaArgs : preset.flags,
      };
    }
    case "SET_JAVA_ARGS":
      return { ...state, javaArgs: action.value };
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const stepSchemas = [
  // Step 0 — Basis
  z.object({
    name: z.string().min(1, "Name ist erforderlich").max(48),
    identifier: z
      .string()
      .min(1, "Identifier ist erforderlich")
      .max(32)
      .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche"),
    runtime: z.enum(["minecraft", "hytale"]),
  }),
  // Step 1 — Version
  z.object({
    version: z.string().optional(),
    modLoader: z.enum([
      "vanilla",
      "forge",
      "fabric",
      "paper",
      "spigot",
      "purpur",
    ]),
  }),
  // Step 2 — Resources
  z.object({
    memory: z.number().min(512, "Mindestens 512 MB"),
    port: z.number().min(1024).max(65535, "Port muss zwischen 1024-65535 sein"),
  }),
  // Step 3 — Confirmation (no validation needed)
  z.object({}),
];

// ---------------------------------------------------------------------------
// Step Components
// ---------------------------------------------------------------------------

function StepBasis({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="w-name">Servername</Label>
        <Input
          id="w-name"
          value={state.name}
          onChange={(e) => dispatch({ type: "SET_NAME", value: e.target.value })}
          placeholder="Mein Minecraft Server"
          autoFocus
        />
        {state.errors.name && (
          <p className="text-xs text-red-500">{state.errors.name}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-id">Identifier</Label>
        <Input
          id="w-id"
          value={state.identifier}
          onChange={(e) =>
            dispatch({ type: "SET_IDENTIFIER", value: e.target.value })
          }
          placeholder="mein-minecraft-server"
          className="font-mono"
        />
        <p className="text-xs text-zinc-500">
          Wird als Container-Name und Verzeichnis verwendet
        </p>
        {state.errors.identifier && (
          <p className="text-xs text-red-500">{state.errors.identifier}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Runtime</Label>
        <Select
          value={state.runtime}
          onValueChange={(v) =>
            dispatch({ type: "SET_FIELD", field: "runtime", value: v })
          }
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
    </div>
  );
}

function StepVersion({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const loaders: { value: ModLoader; label: string }[] = [
    { value: "vanilla", label: "Vanilla" },
    { value: "forge", label: "Forge" },
    { value: "fabric", label: "Fabric" },
    { value: "paper", label: "Paper" },
    { value: "spigot", label: "Spigot" },
    { value: "purpur", label: "Purpur" },
  ];

  const isMinecraft = state.runtime === "minecraft";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="w-version">
          {isMinecraft ? "Minecraft-Version" : "Version"}
        </Label>
        <Input
          id="w-version"
          value={state.version}
          onChange={(e) =>
            dispatch({
              type: "SET_FIELD",
              field: "version",
              value: e.target.value,
            })
          }
          placeholder="latest"
        />
        <p className="text-xs text-zinc-500">
          Leer lassen für die neueste Version
        </p>
      </div>

      {isMinecraft && (
        <div className="space-y-1.5">
          <Label>Mod-Loader</Label>
          <div className="grid grid-cols-3 gap-2">
            {loaders.map((loader) => (
              <button
                key={loader.value}
                type="button"
                onClick={() =>
                  dispatch({
                    type: "SET_FIELD",
                    field: "modLoader",
                    value: loader.value,
                  })
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  state.modLoader === loader.value
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {loader.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isMinecraft && (
        <div className="space-y-1.5">
          <Label>JVM Flags</Label>
          <JvmPresetSelector
            memory={state.memory}
            selectedPresetId={state.jvmPresetId}
            onPresetChange={(presetId, flags) => {
              const preset = { id: presetId, flags } as JvmPreset;
              dispatch({ type: "SET_JVM_PRESET", preset });
            }}
            javaArgs={state.javaArgs}
            onJavaArgsChange={(value) =>
              dispatch({ type: "SET_JAVA_ARGS", value })
            }
          />
        </div>
      )}
    </div>
  );
}

function StepResources({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const memoryLabel =
    state.memory >= 1024
      ? `${(state.memory / 1024).toFixed(1)} GB`
      : `${state.memory} MB`;

  const portIcon =
    state.portStatus === "checking"
      ? "⏳"
      : state.portStatus === "available"
        ? "✅"
        : state.portStatus === "taken"
          ? "❌"
          : "";

  const showQuota = state.ramLimitMb !== null && state.ramLimitMb > 0;
  const availableMb = showQuota
    ? Math.max(0, state.ramLimitMb! - (state.ramUsedMb ?? 0))
    : 0;
  const ramExhausted = showQuota && availableMb < 512;

  let quotaBarColor = "bg-emerald-500";
  if (showQuota) {
    const pct = (state.ramUsedMb ?? 0) / state.ramLimitMb!;
    if (pct > 0.8) quotaBarColor = "bg-red-500";
    else if (pct >= 0.6) quotaBarColor = "bg-amber-400";
  }

  return (
    <div className="space-y-6">
      {showQuota && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>{state.ramUsedMb} MB belegt — {availableMb} MB verfügbar</span>
            <span>{state.ramLimitMb} MB gesamt</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={`h-full rounded-full transition-all ${quotaBarColor}`}
              style={{
                width: `${Math.min(100, ((state.ramUsedMb ?? 0) / state.ramLimitMb!) * 100)}%`,
              }}
            />
          </div>
          {ramExhausted && (
            <p className="text-xs text-red-500">
              Kein RAM-Kontingent mehr verfügbar.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>RAM</Label>
          <span className="text-sm font-semibold">{memoryLabel}</span>
        </div>
        <Slider
          value={[state.memory]}
          onValueChange={([v]) =>
            dispatch({ type: "SET_FIELD", field: "memory", value: v })
          }
          min={512}
          max={state.maxRam}
          step={256}
          disabled={ramExhausted}
        />
        <div className="flex justify-between text-xs text-zinc-500">
          <span>512 MB</span>
          <span>
            {state.maxRam >= 1024
              ? `${(state.maxRam / 1024).toFixed(1)} GB`
              : `${state.maxRam} MB`}
          </span>
        </div>
        {state.errors.memory && (
          <p className="text-xs text-red-500">{state.errors.memory}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="w-port">
          Port {portIcon}
        </Label>
        <Input
          id="w-port"
          type="number"
          value={state.port}
          onChange={(e) =>
            dispatch({
              type: "SET_FIELD",
              field: "port",
              value: Number(e.target.value),
            })
          }
          min={1024}
          max={65535}
        />
        {state.portStatus === "taken" && (
          <p className="text-xs text-red-500">
            Port ist bereits belegt
          </p>
        )}
        {state.errors.port && (
          <p className="text-xs text-red-500">{state.errors.port}</p>
        )}
      </div>
    </div>
  );
}

function StepConfirmation({ state }: { state: WizardState }) {
  const memoryLabel =
    state.memory >= 1024
      ? `${(state.memory / 1024).toFixed(1)} GB`
      : `${state.memory} MB`;

  const rows = [
    { label: "Name", value: state.name },
    { label: "Identifier", value: state.identifier },
    { label: "Runtime", value: state.runtime },
    { label: "Version", value: state.version || "latest" },
    { label: "Mod-Loader", value: state.modLoader },
    { label: "RAM", value: memoryLabel },
    { label: "Port", value: String(state.port) },
  ];

  return (
    <div className="space-y-4">
      {state.errors.submit && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {state.errors.submit}
        </div>
      )}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between px-4 py-2.5 text-sm ${
              i < rows.length - 1
                ? "border-b border-zinc-100 dark:border-zinc-800"
                : ""
            }`}
          >
            <span className="text-zinc-500">{row.label}</span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

const STEPS = [
  { title: "Basis", icon: Server, description: "Name und Runtime wählen" },
  {
    title: "Version",
    icon: Settings,
    description: "Version und Mod-Loader konfigurieren",
  },
  { title: "Ressourcen", icon: Cpu, description: "RAM und Port festlegen" },
  {
    title: "Bestätigung",
    icon: Rocket,
    description: "Zusammenfassung prüfen",
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

interface CreateServerWizardProps {
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateServerWizard({
  projectKey,
  open,
  onOpenChange,
}: CreateServerWizardProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [isPending, startTransition] = useTransition();

  // Fetch RAM quota on open
  useEffect(() => {
    if (!open) return;
    ramRemainingAction()
      .then(({ limitMb, usedMb, availableMb }) => {
        dispatch({ type: "SET_RAM_QUOTA", limitMb, usedMb, availableMb });
      })
      .catch(() => {
        // fallback to defaults
      });
  }, [open]);

  // Check port availability when port changes
  const checkPort = useCallback(
    async (port: number) => {
      if (port < 1024 || port > 65535) return;
      dispatch({ type: "SET_PORT_STATUS", status: "checking" });
      try {
        const available = await checkPortAction({ port });
        dispatch({
          type: "SET_PORT_STATUS",
          status: available ? "available" : "taken",
        });
      } catch {
        dispatch({ type: "SET_PORT_STATUS", status: "idle" });
      }
    },
    [],
  );

  useEffect(() => {
    if (state.step !== 2) return;
    const timer = setTimeout(() => checkPort(state.port), 500);
    return () => clearTimeout(timer);
  }, [state.port, state.step, checkPort]);

  // Reset on close
  useEffect(() => {
    if (!open) dispatch({ type: "RESET" });
  }, [open]);

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
    if (!validateStep()) return;
    if (state.step < STEPS.length - 1) {
      dispatch({ type: "NEXT" });
    }
  }

  function handlePrev() {
    if (state.step > 0) dispatch({ type: "PREV" });
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const image =
          state.runtime === "minecraft"
            ? process.env.NEXT_PUBLIC_MINECRAFT_IMAGE || "itzg/minecraft-server"
            : process.env.NEXT_PUBLIC_HYTALE_IMAGE || "zacheri/hytale-server:latest";

        const result = await createServerAction({
          projectKey,
          input: {
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
            autoStart: state.autoStart,
          },
          autoStartNow: state.autoStart,
        });

        if ("error" in result) {
          if (result.error === "RAM_QUOTA_EXCEEDED") {
            dispatch({ type: "SET_ERRORS", errors: { submit: result.message } });
          } else {
            toast.error(result.message || "Fehler beim Erstellen");
          }
          return;
        }

        toast.success("Server erstellt!");
        onOpenChange(false);
        router.push(`/projects/${projectKey}/servers/${result.serverId}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Fehler beim Erstellen",
        );
      }
    });
  }

  const isLastStep = state.step === STEPS.length - 1;
  const CurrentStepIcon = STEPS[state.step].icon;

  const ramExhaustedOnStep2 =
    state.step === 2 &&
    state.ramLimitMb !== null &&
    state.ramLimitMb > 0 &&
    Math.max(0, state.ramLimitMb - (state.ramUsedMb ?? 0)) < 512;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CurrentStepIcon className="h-5 w-5" />
            {STEPS[state.step].title}
          </DialogTitle>
          <DialogDescription>
            {STEPS[state.step].description}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex flex-1 items-center gap-1">
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  i < state.step
                    ? "bg-emerald-500 text-white"
                    : i === state.step
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
                }`}
              >
                {i < state.step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 rounded transition-colors ${
                    i < state.step
                      ? "bg-emerald-500"
                      : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content with animation */}
        <div className="relative min-h-[220px] overflow-hidden">
          <AnimatePresence mode="wait" custom={state.direction}>
            <motion.div
              key={state.step}
              custom={state.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              {state.step === 0 && (
                <StepBasis state={state} dispatch={dispatch} />
              )}
              {state.step === 1 && (
                <StepVersion state={state} dispatch={dispatch} />
              )}
              {state.step === 2 && (
                <StepResources state={state} dispatch={dispatch} />
              )}
              {state.step === 3 && <StepConfirmation state={state} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Auto-start checkbox on last step */}
        {isLastStep && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={state.autoStart}
              onCheckedChange={(v) =>
                dispatch({
                  type: "SET_FIELD",
                  field: "autoStart",
                  value: !!v,
                })
              }
            />
            Server sofort starten
          </label>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between pt-2">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={state.step === 0 || isPending}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Zurück
          </Button>

          {isLastStep ? (
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-1.5 h-4 w-4" />
              )}
              {isPending ? "Erstelle…" : "Server erstellen"}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={ramExhaustedOnStep2}>
              Weiter
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
