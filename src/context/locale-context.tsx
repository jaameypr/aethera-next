"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { resolveLocale, getTranslations, buildT, interpolate } from "@/lib/i18n/index";
import { setLocaleAction } from "@/app/(app)/actions/locale";
import type { Locale } from "@/lib/i18n/types";
import type { TFunction } from "@/lib/i18n/index";

interface LocaleContextValue {
  locale: Locale;
  t: TFunction;
  setLocale: (locale: Locale) => Promise<void>;
  isPending: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  children: React.ReactNode;
  initialLocale: Locale;
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    () => resolveLocale(initialLocale),
  );
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const t = useMemo(() => buildT(getTranslations(locale)), [locale]);

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === locale || isPending) return;
      setIsPending(true);
      // 1. Optimistic update: client components re-render immediately
      setLocaleState(nextLocale);
      // 2. Update <html lang> attribute optimistically
      if (typeof document !== "undefined") {
        document.documentElement.lang = nextLocale;
      }
      try {
        // 3. Persist to cookie (server action) — must complete before refresh
        await setLocaleAction(nextLocale);
        // 4. Refresh server components with the new locale
        router.refresh();
      } finally {
        setIsPending(false);
      }
    },
    [locale, isPending, router],
  );

  const value = useMemo(
    () => ({ locale, t, setLocale, isPending }),
    [locale, t, setLocale, isPending],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** Hook for all client components to access translations and locale switcher. */
export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return ctx;
}

export { interpolate };
