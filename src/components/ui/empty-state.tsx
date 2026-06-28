import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Pass a lucide icon element, e.g. <Server className="h-6 w-6" />. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional CTA — a <Button> or link. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Shared empty state. Replaces dashed-box-with-a-sentence placeholders.
 * Empty states are conversion moments — give them an icon, a clear line,
 * and a single obvious next action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex animate-slide-up flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-8 ring-secondary/40">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
