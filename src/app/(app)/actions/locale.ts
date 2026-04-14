"use server";

import { cookies } from "next/headers";
import { resolveLocale } from "@/lib/i18n/index";
import type { Locale } from "@/lib/i18n/types";

export async function setLocaleAction(locale: Locale): Promise<void> {
  const resolved = resolveLocale(locale);
  const cookieStore = await cookies();
  cookieStore.set("locale", resolved, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    secure: process.env.NODE_ENV === "production",
  });
}
