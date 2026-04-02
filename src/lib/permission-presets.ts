export interface PermissionDefinition {
  name: string;
  label: string;
  description: string;
  category: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    name: "*",
    label: "Full Access",
    description: "Grants all permissions (superadmin)",
    category: "Global",
  },
  {
    name: "admin.users",
    label: "Manage Users",
    description: "Create, edit, delete users",
    category: "Admin",
  },
  {
    name: "admin.roles",
    label: "Manage Roles",
    description: "Create, edit, delete roles",
    category: "Admin",
  },
  {
    name: "admin.mail",
    label: "Manage Mail Templates",
    description: "Edit mail templates and settings",
    category: "Admin",
  },
  {
    name: "project.*",
    label: "All Project Permissions",
    description: "Full access to all projects",
    category: "Projects",
  },
  {
    name: "project.create",
    label: "Create Projects",
    description: "Create new projects",
    category: "Projects",
  },
  {
    name: "project.read",
    label: "View Projects",
    description: "View project details",
    category: "Projects",
  },
  {
    name: "project.update",
    label: "Edit Projects",
    description: "Edit existing projects",
    category: "Projects",
  },
  {
    name: "project.delete",
    label: "Delete Projects",
    description: "Delete projects",
    category: "Projects",
  },
  {
    name: "files.upload",
    label: "Upload Files",
    description: "Upload files to the system",
    category: "Files",
  },
  {
    name: "files.manage",
    label: "Manage Files",
    description: "Manage uploaded files and backups",
    category: "Files",
  },
  {
    name: "module.*",
    label: "All Module Permissions",
    description: "Full access to all modules",
    category: "Modules",
  },
  {
    name: "module.manage",
    label: "Manage Modules",
    description: "Install, update, and remove modules",
    category: "Modules",
  },
  {
    name: "module.access",
    label: "Access Modules",
    description: "Open installed modules",
    category: "Modules",
  },
];

export interface PermissionPreset {
  name: string;
  label: string;
  description: string;
  permissions: { name: string; allow: boolean }[];
}

export const PERMISSION_QUICK_PRESETS: PermissionPreset[] = [
  {
    name: "superadmin",
    label: "Superadmin",
    description: "Full access to everything",
    permissions: [{ name: "*", allow: true }],
  },
  {
    name: "admin",
    label: "Administrator",
    description: "Admin panel access without superadmin",
    permissions: [
      { name: "admin.users", allow: true },
      { name: "admin.roles", allow: true },
      { name: "admin.mail", allow: true },
      { name: "project.*", allow: true },
      { name: "files.upload", allow: true },
      { name: "files.manage", allow: true },
      { name: "module.*", allow: true },
    ],
  },
  {
    name: "user",
    label: "Standard User",
    description: "Project access with file upload",
    permissions: [
      { name: "project.read", allow: true },
      { name: "project.update", allow: true },
      { name: "files.upload", allow: true },
    ],
  },
  {
    name: "viewer",
    label: "Viewer",
    description: "Read-only access to projects",
    permissions: [{ name: "project.read", allow: true }],
  },
];
