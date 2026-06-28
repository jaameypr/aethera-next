"use client";

import { Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { JVM_FLAG_PRESETS } from "@/lib/constants/jvm-presets";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

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
  const { t } = useLocale();
  return (
    <div className="space-y-1.5">
      <TooltipProvider delayDuration={300}>
        <div className="grid grid-cols-2 gap-2">
          {JVM_FLAG_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            const inRange = memory >= (preset.minRamMb ?? 0);
            const tooltipText =
              !inRange && preset.minRamMb
                ? t("servers.jvmPresets.recommendedFrom", {
                    ram: preset.minRamMb >= 1024 ? `${preset.minRamMb / 1024} GB` : `${preset.minRamMb} MB`,
                  })
                : t(`servers.jvmPresets.${preset.id}.description`);

            const ramHint = preset.minRamMb
              ? preset.minRamMb >= 1024
                ? `${preset.minRamMb / 1024} GB+`
                : `${preset.minRamMb} MB+`
              : null;

            return (
              <Tooltip key={preset.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-preset-id={preset.id}
                    data-in-range={inRange}
                    aria-pressed={isSelected}
                    onClick={() => onPresetChange(preset.id, preset.flags)}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border px-3 py-2 text-left text-sm font-medium",
                      "transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out",
                      "hover:-translate-y-0.5 hover:shadow-z2",
                      isSelected
                        ? "border-brand bg-brand-muted text-foreground shadow-glow-brand ring-1 ring-brand/40"
                        : inRange
                          ? "border-border bg-card text-foreground hover:border-brand/50"
                          : "border-border bg-card text-muted-foreground hover:border-border",
                    )}
                  >
                    {/* brand left-accent on selected */}
                    <span
                      aria-hidden
                      className={cn(
                        "absolute inset-y-0 left-0 w-1 origin-left bg-brand transition-transform duration-200 ease-out",
                        isSelected ? "scale-x-100" : "scale-x-0",
                      )}
                    />
                    <span className="flex items-center justify-between gap-2 pl-1.5">
                      <span className="truncate">{t(`servers.jvmPresets.${preset.id}.label`)}</span>
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-brand animate-fade-in" />
                      ) : ramHint ? (
                        <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                          {ramHint}
                        </span>
                      ) : null}
                    </span>
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
          className="mt-1.5 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 animate-slide-up"
        />
      )}
    </div>
  );
}
