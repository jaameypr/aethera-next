"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyableFieldProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyableField({ value, label, className }: CopyableFieldProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </p>
      )}
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900">
          {value}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
