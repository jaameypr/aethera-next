"use client";

import { useEffect } from "react";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

interface ProjectActivitySectionProps {
  projectKey: string;
}

export function ProjectActivitySection({ projectKey }: ProjectActivitySectionProps) {
  useEffect(() => {
    void fetch("/api/activity/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey }),
    }).catch(() => {
      /* non-blocking: marking seen must never break the page */
    });
  }, [projectKey]);

  return <ActivityFeed projectKey={projectKey} />;
}
