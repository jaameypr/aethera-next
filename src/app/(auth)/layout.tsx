import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-100 via-zinc-50 to-white dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <ThemeSwitcher />
        <LanguageSwitcher side="bottom" align="end" />
      </div>
      <div className="w-full max-w-md px-4">{children}</div>
    </div>
  );
}
