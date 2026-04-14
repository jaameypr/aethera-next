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

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="truncate">{name}</span>
          <span className="flex items-center gap-1.5 text-sm font-normal text-zinc-400">
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
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("projects.card.noServers")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {servers.slice(0, 5).map((s) => (
              <li key={s._id} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    s.status === "running"
                      ? "h-2 w-2 rounded-full bg-emerald-500"
                      : s.status === "error"
                        ? "h-2 w-2 rounded-full bg-red-500"
                        : "h-2 w-2 rounded-full bg-zinc-400"
                  }
                />
                <span className="truncate text-zinc-700 dark:text-zinc-300">
                  {s.name}
                </span>
              </li>
            ))}
            {servers.length > 5 && (
              <li className="text-xs text-zinc-400">
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
