"use client";

import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n/types";

interface LanguageSwitcherProps {
  /** Compact mode: show only the flag/code. Defaults to false. */
  compact?: boolean;
  className?: string;
}

const LOCALE_LABELS: Record<Locale, { code: string; label: string }> = {
  en: { code: "EN", label: "English" },
  de: { code: "DE", label: "Deutsch" },
};

export function LanguageSwitcher({
  compact = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, setLocale, isPending } = useLocale();
  const next: Locale = locale === "en" ? "de" : "en";
  const current = LOCALE_LABELS[locale];
  const nextLabel = LOCALE_LABELS[next];

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => setLocale(next)}
      title={`Switch to ${nextLabel.label}`}
      className={cn(
        "gap-1.5 font-mono text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50",
        className,
      )}
      aria-label={`Switch to ${nextLabel.label}`}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none",
          locale === "de"
            ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
            : "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
        )}
      >
        DE
      </span>
      {!compact && (
        <>
          <span className="text-zinc-300 dark:text-zinc-600">/</span>
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none",
              locale === "en"
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200",
            )}
          >
            EN
          </span>
        </>
      )}
      {!compact && (
        <span className="ml-0.5 text-zinc-500 dark:text-zinc-400">
          {current.code}
        </span>
      )}
    </Button>
  );
}
