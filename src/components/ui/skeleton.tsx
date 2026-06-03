import { cn } from "@/lib/utils";

/**
 * Shimmering placeholder. Use instead of spinners for any load that may
 * exceed ~300ms so layout is reserved (no CLS) and the wait feels shorter.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-[length:200%_100%] bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 dark:from-zinc-800 dark:via-zinc-700/70 dark:to-zinc-800",
        className,
      )}
      {...props}
    />
  );
}

/** Convenience: N lines of text skeleton with a shorter trailing line. */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText };
