"use client";

import Link from "next/link";
import { Server, Play, Eye } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

interface ServerSummary {
  _id: string;
  name: string;
  status: "stopped" | "starting" | "running" | "stopping" | "error";
}

interface ProjectCardProps {
  projectKey: string;
  name: string;
  description?: string;
  servers: ServerSummary[];
}

export function ProjectCard({
  projectKey,
  name,
  description,
  servers,
}: ProjectCardProps) {
  const { t } = useLocale();
  const running = servers.filter((s) => s.status === "running").length;
  const total = servers.length;
  const hasError = servers.some((s) => s.status === "error");

  // Left "health stripe": emerald when all up, amber when mixed,
  // destructive when something is errored / all down, muted when no servers.
  const health =
    total === 0
      ? "bg-border"
      : hasError
        ? "bg-destructive"
        : running === total
          ? "bg-brand"
          : running === 0
            ? "bg-destructive"
            : "bg-warning";

  return (
    <Card interactive className="relative flex flex-col overflow-hidden">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1 rounded-l-lg",
          health,
          total > 0 && running === total && "animate-pulse-soft",
        )}
      />
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="truncate">{name}</span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              total > 0 && running === total && !hasError
                ? "bg-brand-muted text-brand"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Server className="h-3.5 w-3.5" />
            <span>
              {running}/{total}
            </span>
          </span>
        </CardTitle>
        {description && (
          <CardDescription className="truncate">{description}</CardDescription>
        )}
        <CardDescription className="font-mono text-xs">{projectKey}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {servers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("projects.card.noServers")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {servers.slice(0, 5).map((s) => (
              <li key={s._id} className="flex items-center gap-2 text-sm">
                <span className="relative flex h-2 w-2 shrink-0">
                  {s.status === "running" && (
                    <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-brand" />
                  )}
                  <span
                    className={cn(
                      "relative inline-flex h-2 w-2 rounded-full",
                      s.status === "running"
                        ? "bg-brand"
                        : s.status === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/50",
                    )}
                  />
                </span>
                <span className="truncate text-foreground/80">{s.name}</span>
              </li>
            ))}
            {servers.length > 5 && (
              <li className="text-xs text-muted-foreground">
                {t("projects.card.more", { count: servers.length - 5 })}
              </li>
            )}
          </ul>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${projectKey}`}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {t("projects.card.open")}
          </Link>
        </Button>
        {running < total && total > 0 && (
          <Button variant="secondary" size="sm" disabled>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {t("projects.card.startAll")}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
