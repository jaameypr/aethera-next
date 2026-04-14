"use server";

import { cookies } from "next/headers";

export type Theme = "light" | "dark";

export async function setThemeAction(theme: Theme): Promise<void> {
  const jar = await cookies();
  jar.set("theme", theme, {
    path: "/",
    sameSite: "lax",
    maxAge: 31_536_000,
    secure: process.env.NODE_ENV === "production",
  });
}
