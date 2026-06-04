"use client";

import { useCallback } from "react";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

interface ProjectActivitySectionProps {
  projectKey: string;
}

export function ProjectActivitySection({ projectKey }: ProjectActivitySectionProps) {
  // Mark the project's activity as seen only once the user actually opens the
  // (collapsed-by-default) feed — never on mere page load.
  const markSeen = useCallback(() => {
    void fetch("/api/activity/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectKey }),
    }).catch(() => {
      /* non-blocking: marking seen must never break the page */
    });
  }, [projectKey]);

  return <ActivityFeed projectKey={projectKey} collapsible onExpand={markSeen} />;
}
