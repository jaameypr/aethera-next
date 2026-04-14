import type { Locale } from "./types";
import type { TranslationDict } from "./locales/en";
import { en } from "./locales/en";
import { de } from "./locales/de";

export { en, de };
export type { Locale };
export type { TranslationDict } from "./locales/en";

const translations = { en, de };

/** Resolve a raw cookie/localStorage value to a valid Locale. */
export function resolveLocale(raw: string | undefined | null): Locale {
  if (raw === "de") return "de";
  return "en";
}

/** Get the translation dictionary for a locale. */
export function getTranslations(locale: Locale): TranslationDict {
  return (translations as Record<Locale, unknown>)[locale] as TranslationDict;
}

/**
 * Interpolate `{key}` placeholders in a string.
 * @example interpolate("Hello, {name}!", { name: "World" }) → "Hello, World!"
 */
export function interpolate(
  str: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

/** Build a typed `t()` function bound to a specific translation dictionary. */
export type TFunction = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

export function buildT(dict: TranslationDict): TFunction {
  return function t(key: string, vars?: Record<string, string | number>): string {
    const parts = key.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = dict;
    for (const part of parts) {
      if (value == null || typeof value !== "object") break;
      value = value[part];
    }
    const str = typeof value === "string" ? value : key;
    return vars ? interpolate(str, vars) : str;
  };
}
