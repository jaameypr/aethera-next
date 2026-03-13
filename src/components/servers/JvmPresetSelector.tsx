"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { JVM_FLAG_PRESETS } from "@/lib/constants/jvm-presets";

interface JvmPresetSelectorProps {
  memory: number;
  selectedPresetId: string;
  onPresetChange: (presetId: string, flags: string) => void;
  javaArgs: string;
  onJavaArgsChange: (value: string) => void;
}

export default function JvmPresetSelector({
  memory,
  selectedPresetId,
  onPresetChange,
  javaArgs,
  onJavaArgsChange,
}: JvmPresetSelectorProps) {
  return (
    <div className="space-y-1.5">
      <TooltipProvider delayDuration={300}>
        <div className="grid grid-cols-2 gap-2">
          {JVM_FLAG_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            const inRange = memory >= (preset.minRamMb ?? 0);
            const tooltipText =
              !inRange && preset.minRamMb
                ? `Empfohlen ab ${preset.minRamMb >= 1024 ? `${preset.minRamMb / 1024} GB` : `${preset.minRamMb} MB`}`
                : preset.description;

            return (
              <Tooltip key={preset.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-preset-id={preset.id}
                    data-in-range={inRange}
                    onClick={() => onPresetChange(preset.id, preset.flags)}
                    className={[
                      "rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors",
                      isSelected
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-white dark:bg-zinc-900",
                      isSelected
                        ? inRange
                          ? "border-emerald-500"
                          : "border-zinc-900 dark:border-zinc-100"
                        : inRange
                          ? "border-emerald-400 text-zinc-700 hover:border-emerald-500 dark:border-emerald-600 dark:text-zinc-300 dark:hover:border-emerald-500"
                          : "border-zinc-200 text-zinc-400 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600",
                    ].join(" ")}
                  >
                    {preset.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-56 text-center">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {selectedPresetId === "custom" && (
        <textarea
          value={javaArgs}
          onChange={(e) => onJavaArgsChange(e.target.value)}
          placeholder="-XX:+UseG1GC ..."
          rows={3}
          className="mt-1.5 w-full resize-y rounded-md border border-zinc-200 bg-transparent px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      )}
    </div>
  );
}
