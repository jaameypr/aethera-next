import {
  Activity,
  Play,
  Square,
  PlusCircle,
  Trash2,
  ArrowUpCircle,
  Database,
  DatabaseBackup,
  AlertTriangle,
  UserPlus,
  UserMinus,
  Users,
  Settings,
  FolderPlus,
  FolderCog,
  type LucideIcon,
} from "lucide-react";

/** Icon + Tailwind text-color class for a project-log action. */
export interface ActivityVisual {
  Icon: LucideIcon;
  className: string;
}

const ACTIVITY_VISUALS: Record<string, ActivityVisual> = {
  SERVER_CREATED: { Icon: PlusCircle, className: "text-emerald-500" },
  SERVER_DELETED: { Icon: Trash2, className: "text-red-500" },
  SERVER_STARTED: { Icon: Play, className: "text-emerald-500" },
  SERVER_STOPPED: { Icon: Square, className: "text-zinc-400" },
  SERVER_VERSION_UPDATED: { Icon: ArrowUpCircle, className: "text-indigo-500" },
  BACKUP_CREATED: { Icon: Database, className: "text-sky-500" },
  BACKUP_STARTED: { Icon: Database, className: "text-sky-400" },
  BACKUP_COMPLETED: { Icon: Database, className: "text-sky-500" },
  BACKUP_RESTORED: { Icon: DatabaseBackup, className: "text-violet-500" },
  BACKUP_DELETED: { Icon: Trash2, className: "text-zinc-400" },
  BACKUP_FAILED: { Icon: AlertTriangle, className: "text-red-500" },
  MEMBER_ADDED: { Icon: UserPlus, className: "text-emerald-500" },
  MEMBER_REMOVED: { Icon: UserMinus, className: "text-red-500" },
  MEMBER_ROLE_CHANGED: { Icon: Users, className: "text-amber-500" },
  SETTINGS_CHANGED: { Icon: Settings, className: "text-amber-500" },
  PROJECT_CREATED: { Icon: FolderPlus, className: "text-emerald-500" },
  PROJECT_UPDATED: { Icon: FolderCog, className: "text-amber-500" },
};

const FALLBACK: ActivityVisual = { Icon: Activity, className: "text-muted-foreground" };

export function activityVisual(action: string): ActivityVisual {
  return ACTIVITY_VISUALS[action] ?? FALLBACK;
}
