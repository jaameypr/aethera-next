import { cn } from "@/lib/utils";

type BadgeVariant = "enabled" | "disabled" | "running" | "stopped" | "default";

const variantStyles: Record<BadgeVariant, string> = {
  enabled:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  disabled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  running:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  stopped: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

/* States that represent a live / active condition get an animated pulse ring. */
const pulsingVariants = new Set<BadgeVariant>(["running", "enabled"]);

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  /** Force-hide the leading dot (e.g. when used purely as a label chip). */
  hideDot?: boolean;
}

export function StatusBadge({
  variant,
  children,
  className,
  hideDot = false,
}: StatusBadgeProps) {
  const pulses = pulsingVariants.has(variant);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className,
      )}
    >
      {!hideDot && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          {pulses && (
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-current" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
