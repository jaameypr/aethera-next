"use client";

import { Globe, Check, ChevronRight } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LOCALES } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n/types";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

const LOCALE_CODES: Record<Locale, string> = {
  en: "EN",
  de: "DE",
};

interface LanguageSwitcherProps {
  /** Hide label text — show Globe icon only on the trigger. */
  compact?: boolean;
  className?: string;
  /** Which side the dropdown panel opens toward. Defaults to "right". */
  side?: "top" | "bottom" | "left" | "right";
  /** Alignment of the dropdown relative to the trigger. Defaults to "start". */
  align?: "start" | "center" | "end";
}

export function LanguageSwitcher({
  compact = false,
  className,
  side = "right",
  align = "start",
}: LanguageSwitcherProps) {
  const { locale, setLocale, isPending } = useLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className={cn(
            "gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50",
            compact ? "h-8 w-8 p-0 justify-center" : "px-2",
            className,
          )}
          aria-label="Select language"
        >
          <Globe className="h-4 w-4 shrink-0" />
          {!compact && (
            <>
              <span className="font-medium">Language</span>
              <span className="font-mono font-bold text-zinc-400 dark:text-zinc-500">
                {LOCALE_CODES[locale]}
              </span>
              <ChevronRight className="h-3 w-3 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} className="min-w-[140px]">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => setLocale(l)}
            className={cn(
              "flex items-center gap-2 cursor-pointer",
              l === locale &&
                "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50",
            )}
          >
            <span className="font-mono text-[11px] font-bold w-6 shrink-0 opacity-60">
              {LOCALE_CODES[l]}
            </span>
            <span className="flex-1">{LOCALE_LABELS[l]}</span>
            {l === locale && <Check className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
