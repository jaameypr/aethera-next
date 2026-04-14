import "server-only";
import { cookies } from "next/headers";
import { resolveLocale, getTranslations, buildT } from "./index";
import type { Locale } from "./types";

/**
 * Server-only helper: read the locale cookie and return typed translation utils.
 * Use in React Server Components and Server Actions that need the current locale.
 */
export async function getServerT() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  const locale: Locale = resolveLocale(raw);
  const dict = getTranslations(locale);
  const t = buildT(dict);
  return { t, locale, dict };
}
