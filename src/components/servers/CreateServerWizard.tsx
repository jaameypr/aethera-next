"use client";

import { useReducer, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, ChevronDown, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
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
  ramRemainingAction,
} from "@/app/(app)/actions/servers";
import { JVM_FLAG_PRESETS, type JvmPreset } from "@/lib/constants/jvm-presets";
import JvmPresetSelector from "@/components/servers/JvmPresetSelector";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOD_LOADERS = [
  { value: "vanilla", label: "Vanilla" },
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "paper", label: "Paper" },
  { value: "spigot", label: "Spigot" },
  { value: "purpur", label: "Purpur" },
] as const;

type ModLoader = (typeof MOD_LOADERS)[number]["value"];

const RUNTIMES = [
  { value: "minecraft", label: "Minecraft" },
  { value: "hytale", label: "Hytale" },
] as const;

type Runtime = (typeof RUNTIMES)[number]["value"];

// ---------------------------------------------------------------------------
// Zod schemas per step
// ---------------------------------------------------------------------------

const step1Schema = z.object({
  name: z.string().min(3, "Mindestens 3 Zeichen erforderlich"),
  identifier: z
    .string()
    .min(2, "Mindestens 2 Zeichen")
    .max(40, "Maximal 40 Zeichen")
    .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Zahlen und Bindestriche"),
  runtime: z.enum(["minecraft", "hytale"]),
});

const step2Schema = z.object({
  version: z.string().min(1, "Version erforderlich"),
  modLoader: z.enum([
    "vanilla",
    "forge",
    "fabric",
    "paper",
    "spigot",
    "purpur",
  ]),
  memory: z.number().min(512).max(8192),
  port: z.number().min(1024, "Mindestens 1024").max(65535, "Maximal 65535"),
  rconPort: z
    .number()
    .min(1024)
    .max(65535)
    .optional(),
});

// ---------------------------------------------------------------------------
// State / Reducer
// ---------------------------------------------------------------------------

const DEFAULT_JVM_PRESET = JVM_FLAG_PRESETS.find((p) => p.id === "aikars")!;

interface WizardState {
  step: 1 | 2 | 3;
  direction: 1 | -1;
  name: string;
  identifier: string;
  runtime: Runtime;
  version: string;
  modLoader: ModLoader;
  memory: number;
  port: number;
  rconPort: number | undefined;
  jvmPresetId: string;
  javaArgs: string;
  ramLimitMb: number | null;
  ramUsedMb: number | null;
  autoStart: boolean;
  errors: Partial<Record<string, string>>;
  submitting: boolean;
}

type WizardAction =
  | { type: "SET"; field: keyof WizardState; value: unknown }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "SET_ERRORS"; errors: Partial<Record<string, string>> }
  | { type: "SET_SUBMITTING"; value: boolean }
  | { type: "SET_RAM_QUOTA"; limitMb: number; usedMb: number; availableMb: number }
  | { type: "SET_JVM_PRESET"; preset: JvmPreset }
  | { type: "SET_JAVA_ARGS"; value: string };

const initialState: WizardState = {
  step: 1,
  direction: 1,
  name: "",
  identifier: "",
  runtime: "minecraft",
  version: "latest",
  modLoader: "vanilla",
  memory: 2048,
  port: 25565,
  rconPort: undefined,
  jvmPresetId: DEFAULT_JVM_PRESET.id,
  javaArgs: DEFAULT_JVM_PRESET.flags,
  ramLimitMb: null,
  ramUsedMb: null,
  autoStart: false,
  errors: {},
  submitting: false,
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET":
      return { ...state, [action.field]: action.value, errors: {} };
    case "NEXT":
      return {
        ...state,
        step: Math.min(state.step + 1, 3) as 1 | 2 | 3,
        direction: 1,
        errors: {},
      };
    case "PREV":
      return {
        ...state,
        step: Math.max(state.step - 1, 1) as 1 | 2 | 3,
        direction: -1,
        errors: {},
      };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "SET_SUBMITTING":
      return { ...state, submitting: action.value };
    case "SET_RAM_QUOTA": {
      const { limitMb, usedMb, availableMb } = action;
      const hasQuota = limitMb > 0;
      const maxRam = hasQuota ? Math.min(availableMb, 32768) : 32768;
      return {
        ...state,
        ramLimitMb: hasQuota ? limitMb : null,
        ramUsedMb: hasQuota ? usedMb : null,
        memory: Math.min(state.memory, maxRam),
      };
    }
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
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function parseErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEP_LABELS = ["Basis", "Ressourcen", "Bestätigung"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <div key={n} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                done
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : active
                    ? "border-2 border-zinc-900 text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                    : "border-2 border-zinc-300 text-zinc-400 dark:border-zinc-700",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={cn(
                "hidden text-sm sm:block",
                active
                  ? "font-medium text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-400",
              )}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className="mx-1 h-px w-6 bg-zinc-200 dark:bg-zinc-700" />
            )}
          </div>
        );
      })}
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
  const set = (field: keyof WizardState) => (value: unknown) =>
    dispatch({ type: "SET", field, value });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="w-name">Server-Name</Label>
        <Input
          id="w-name"
          placeholder="Mein Minecraft Server"
          value={state.name}
          onChange={(e) => {
            const name = e.target.value;
            dispatch({ type: "SET", field: "name", value: name });
            // Auto-generate identifier only if not manually edited
            if (!state.identifier || state.identifier === slugify(state.name)) {
              dispatch({
                type: "SET",
                field: "identifier",
                value: slugify(name),
              });
            }
          }}
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
            set("identifier")(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
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
          onValueChange={(v) => set("runtime")(v as Runtime)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RUNTIMES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Version & Ressourcen
// ---------------------------------------------------------------------------

function Step2({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const set = (field: keyof WizardState) => (value: unknown) =>
    dispatch({ type: "SET", field, value });

  const [jvmOpen, setJvmOpen] = useState(false);

  const portTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portCheckRef = useRef<boolean | null>(null);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const checkPort = useCallback(
    (port: number) => {
      if (portTimerRef.current) clearTimeout(portTimerRef.current);
      portTimerRef.current = setTimeout(async () => {
        try {
          const available = await checkPortAction({ port });
          portCheckRef.current = available;
          forceUpdate();
        } catch {
          portCheckRef.current = null;
          forceUpdate();
        }
      }, 600);
    },
    [],
  );

  useEffect(() => {
    checkPort(state.port);
    return () => {
      if (portTimerRef.current) clearTimeout(portTimerRef.current);
    };
  }, [state.port, checkPort]);

  const maxRam = state.ramLimitMb !== null
    ? Math.min(Math.max(0, state.ramLimitMb - (state.ramUsedMb ?? 0)), 32768)
    : 32768;
  const ramExhausted = state.ramLimitMb !== null && maxRam < 512;

  const quotaBannerColor = useMemo(() => {
    if (!state.ramLimitMb) return null;
    const usedPct = ((state.ramUsedMb ?? 0) / state.ramLimitMb) * 100;
    if (usedPct >= 90) return "red";
    if (usedPct >= 70) return "amber";
    return "green";
  }, [state.ramLimitMb, state.ramUsedMb]);

  const isMinecraft = state.runtime === "minecraft";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="w-version">Version</Label>
          <Input
            id="w-version"
            placeholder="latest"
            value={state.version}
            onChange={(e) => set("version")(e.target.value)}
          />
        </div>

        {isMinecraft && (
          <div className="space-y-1.5">
            <Label>Mod-Loader</Label>
            <Select
              value={state.modLoader}
              onValueChange={(v) => set("modLoader")(v as ModLoader)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOD_LOADERS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* RAM Quota Banner */}
      {state.ramLimitMb !== null && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-zinc-500">RAM-Kontingent</span>
            <span className="font-mono font-medium">
              {formatMemory(state.ramUsedMb ?? 0)} / {formatMemory(state.ramLimitMb)} belegt
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                quotaBannerColor === "red"
                  ? "bg-red-500"
                  : quotaBannerColor === "amber"
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
              style={{
                width: `${Math.min(100, (((state.ramUsedMb ?? 0) / state.ramLimitMb) * 100))}%`,
              }}
            />
          </div>
          {ramExhausted && (
            <p className="mt-1.5 text-xs text-red-500">
              RAM-Kontingent erschöpft — kein weiterer Server möglich.
            </p>
          )}
        </div>
      )}

      {/* RAM */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>RAM</Label>
          <span className="font-mono text-sm font-medium">
            {formatMemory(state.memory)}
          </span>
        </div>
        <Slider
          min={512}
          max={Math.max(512, maxRam)}
          step={512}
          value={[state.memory]}
          onValueChange={([v]) => set("memory")(v)}
          disabled={ramExhausted}
        />
        <div className="flex justify-between text-xs text-zinc-400">
          <span>512 MB</span>
          <span>{formatMemory(Math.max(512, maxRam))}</span>
        </div>
      </div>

      {/* JVM Flags (Minecraft only, collapsed by default) */}
      {isMinecraft && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setJvmOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <span>JVM Flags</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", jvmOpen && "rotate-180")}
            />
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

      {/* Port */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="w-port">Port</Label>
          <div className="relative">
            <Input
              id="w-port"
              type="number"
              value={state.port}
              onChange={(e) => set("port")(Number(e.target.value))}
            />
            {portCheckRef.current === true && (
              <CheckCircle2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-500" />
            )}
            {portCheckRef.current === false && (
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
          {state.errors.port && (
            <p className="text-xs text-red-500">{state.errors.port}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="w-rcon">RCON Port (optional)</Label>
          <Input
            id="w-rcon"
            type="number"
            value={state.rconPort ?? ""}
            onChange={(e) =>
              set("rconPort")(e.target.value ? Number(e.target.value) : undefined)
            }
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Bestätigung
// ---------------------------------------------------------------------------

function Step3({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const rows = [
    ["Name", state.name],
    ["Identifier", state.identifier],
    ["Runtime", state.runtime],
    ["Version", state.version],
    ...(state.runtime === "minecraft" ? [["Mod-Loader", state.modLoader]] : []),
    ["RAM", formatMemory(state.memory)],
    ["Port", String(state.port)],
    ...(state.rconPort ? [["RCON Port", String(state.rconPort)]] : []),
    ...(state.runtime === "minecraft" && state.jvmPresetId !== "minimal"
      ? [["JVM Preset", JVM_FLAG_PRESETS.find((p) => p.id === state.jvmPresetId)?.label ?? state.jvmPresetId]]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr
                key={label}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td className="w-36 px-3 py-2 text-zinc-500">{label}</td>
                <td className="px-3 py-2 font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-zinc-300"
          checked={state.autoStart}
          onChange={(e) =>
            dispatch({ type: "SET", field: "autoStart", value: e.target.checked })
          }
        />
        <span className="text-sm font-medium">Sofort starten nach Erstellung</span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard
// ---------------------------------------------------------------------------

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
};

interface Props {
  projectKey: string;
}

export function CreateServerWizard({ projectKey }: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load RAM quota on mount
  useEffect(() => {
    ramRemainingAction()
      .then(({ limitMb, usedMb, availableMb }) => {
        if (limitMb > 0) {
          dispatch({ type: "SET_RAM_QUOTA", limitMb, usedMb, availableMb });
        }
      })
      .catch(() => {});
  }, []);

  const ramExhaustedOnStep2 =
    state.step === 2 &&
    state.ramLimitMb !== null &&
    Math.min(Math.max(0, state.ramLimitMb - (state.ramUsedMb ?? 0)), 32768) < 512;

  function validateStep(): boolean {
    const schema = state.step === 1 ? step1Schema : step2Schema;
    const data =
      state.step === 1
        ? { name: state.name, identifier: state.identifier, runtime: state.runtime }
        : {
            version: state.version,
            modLoader: state.modLoader,
            memory: state.memory,
            port: state.port,
            rconPort: state.rconPort,
          };

    const result = schema.safeParse(data);
    if (!result.success) {
      dispatch({
        type: "SET_ERRORS",
        errors: parseErrors(result.error.issues),
      });
      return false;
    }
    return true;
  }

  function handleNext() {
    if (validateStep()) dispatch({ type: "NEXT" });
  }

  async function handleSubmit() {
    dispatch({ type: "SET_SUBMITTING", value: true });
    try {
      const image =
        state.runtime === "minecraft"
          ? "itzg/minecraft-server"
          : "zacheri/hytale-server";
      const tag = state.runtime === "minecraft" ? "stable" : "latest";

      const result = await createServerAction({
        projectKey,
        input: {
          name: state.name,
          identifier: state.identifier,
          runtime: state.runtime,
          image,
          tag,
          port: state.port,
          rconPort: state.rconPort,
          memory: state.memory,
          version: state.version !== "latest" ? state.version : undefined,
          modLoader: state.modLoader,
          javaArgs: state.javaArgs || undefined,
          autoStart: state.autoStart,
        },
        autoStartNow: state.autoStart,
      });

      if ("error" in result) {
        toast.error(result.message);
        dispatch({ type: "SET_SUBMITTING", value: false });
        return;
      }

      toast.success("Server erstellt");
      router.push(`/projects/${projectKey}/servers/${result.serverId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
      dispatch({ type: "SET_SUBMITTING", value: false });
    }
  }

  const isLastStep = state.step === 3;

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
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="p-6"
          >
            {state.step === 1 && (
              <Step1 state={state} dispatch={dispatch} />
            )}
            {state.step === 2 && (
              <Step2 state={state} dispatch={dispatch} />
            )}
            {state.step === 3 && (
              <Step3 state={state} dispatch={dispatch} />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "PREV" })}
            disabled={state.step === 1 || state.submitting}
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Zurück
          </Button>

          {isLastStep ? (
            <Button onClick={handleSubmit} disabled={state.submitting}>
              {state.submitting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {state.submitting ? "Erstelle…" : "Server erstellen"}
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={ramExhaustedOnStep2}>
              Weiter
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
