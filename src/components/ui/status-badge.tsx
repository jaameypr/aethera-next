import { cn } from "@/lib/utils";

type BadgeVariant = "enabled" | "disabled" | "running" | "stopped" | "default";

const variantStyles: Record<BadgeVariant, string> = {
  enabled:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  disabled:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  running:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  stopped:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  default:
    "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
