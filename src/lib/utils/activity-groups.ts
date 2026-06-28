import type { ProjectLogAction } from "@/lib/db/models/project-log";

/**
 * Action-type filter taxonomy for the audit log. Groups the 17 raw
 * `ProjectLogAction`s into the four categories an admin actually reasons about
 * (server / backup / members / project) so the filter UI can offer both a
 * one-click group toggle and per-action precision.
 */
export type ActionGroupKey = "server" | "backup" | "member" | "project";

export interface ActionGroup {
  key: ActionGroupKey;
  actions: ProjectLogAction[];
}

export const ACTION_GROUPS: ActionGroup[] = [
  {
    key: "server",
    actions: [
      "SERVER_CREATED",
      "SERVER_DELETED",
      "SERVER_STARTED",
      "SERVER_STOPPED",
      "SERVER_VERSION_UPDATED",
    ],
  },
  {
    key: "backup",
    actions: [
      "BACKUP_CREATED",
      "BACKUP_RESTORED",
      "BACKUP_DELETED",
      "BACKUP_STARTED",
      "BACKUP_COMPLETED",
      "BACKUP_FAILED",
    ],
  },
  {
    key: "member",
    actions: ["MEMBER_ADDED", "MEMBER_REMOVED", "MEMBER_ROLE_CHANGED"],
  },
  {
    key: "project",
    actions: ["SETTINGS_CHANGED", "PROJECT_CREATED", "PROJECT_UPDATED"],
  },
];

/** Every action across all groups, in display order. */
export const ALL_ACTIONS: ProjectLogAction[] = ACTION_GROUPS.flatMap(
  (g) => g.actions,
);
