export interface PermissionEntry {
  name: string;
  allow: boolean;
  value?: string | number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
  userId: string;
  username: string;
  email: string;
  roles: string[];
}

export interface CurrentUserResponse {
  _id: string;
  username: string;
  email: string;
  enabled: boolean;
  roles: AdminRoleResponse[];
  permissions: PermissionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserResponse {
  _id: string;
  username: string;
  email: string;
  enabled: boolean;
  roles: string[];
  permissions: PermissionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminRoleResponse {
  _id: string;
  name: string;
  description: string;
  permissions: PermissionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  username: string;
  email?: string;
  password?: string;
  enabled?: boolean;
  roles?: string[];
  permissions?: PermissionEntry[];
}

export interface UpdateUserPayload {
  username?: string;
  email?: string;
  enabled?: boolean;
  roles?: string[];
  permissions?: PermissionEntry[];
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  permissions: PermissionEntry[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  permissions?: PermissionEntry[];
}

export interface ResetPasswordResponse {
  tempPassword: string;
  emailSent: boolean;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface LoginPayload {
  usernameOrEmail: string;
  password: string;
  remember?: boolean;
}

export interface SetupPayload {
  username: string;
  email?: string;
  password: string;
}

/* ------------------------------------------------------------------ */
/*  Module System Types                                                */
/* ------------------------------------------------------------------ */

/** A single version entry inside the remote registry. */
export interface RegistryModuleVersion {
  version: string;
  releaseDate: string;
  minAetheraVersion: string;
  changelog: string;
  /** Pre-built Docker image reference (docker modules). */
  image?: string;
  /** Git repository URL to build from (docker modules without pre-built image). */
  repository?: string;
  /** npm package name (code modules). */
  package?: string;
  /** URL to the aethera-module.json manifest for this version. */
  manifestUrl: string;
}

/** A module entry as returned from the remote registry JSON. */
export interface RegistryModule {
  id: string;
  name: string;
  description: string;
  author: string;
  icon: string;
  repository: string;
  category: string;
  tags: string[];
  type: "docker" | "code";
  versions: RegistryModuleVersion[];
}

/** The full remote registry payload. */
export interface ModuleRegistry {
  version: number;
  updatedAt: string;
  modules: RegistryModule[];
}

/** Sidebar item definition from a module manifest. */
export interface ModuleManifestSidebarItem {
  label: string;
  icon: string;
  description?: string;
  href?: string;
  internal?: boolean;
}

/** Docker-specific config inside a module manifest. */
export interface ModuleManifestDocker {
  /** Pre-built image reference (e.g. from GHCR/DockerHub). */
  image?: string;
  /** Build from source when no pre-built image is available. */
  build?: {
    repository: string;
    context?: string;
    dockerfile?: string;
    branch?: string;
  };
  port: number;
  healthCheck?: string;
  volumes?: Record<string, string>;
  resources?: { memoryLimit?: string; cpuLimit?: string };
}

/** Auth config inside a module manifest. */
export interface ModuleManifestAuth {
  strategy: "api_key" | "none";
  exchangePath?: string;
}

/** Env var definition in a module manifest. */
export interface ModuleManifestEnvDef {
  key: string;
  label: string;
  default?: string;
  required?: boolean;
  secret?: boolean;
}

/** The full aethera-module.json manifest. */
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  icon: string;
  type: "docker" | "code";
  minAetheraVersion: string;
  docker?: ModuleManifestDocker;
  auth?: ModuleManifestAuth;
  database?: { type: string; name: string };
  sidebar?: {
    section: string;
    items: ModuleManifestSidebarItem[];
  };
  env?: {
    auto?: string[];
    configurable?: ModuleManifestEnvDef[];
  };
  permissions?: Array<{ name: string; description: string }>;
}

/** Response for GET /api/modules — an installed module. */
export interface InstalledModuleResponse {
  _id: string;
  moduleId: string;
  name: string;
  version: string;
  type: "docker" | "code";
  status: string;
  internalUrl?: string;
  assignedPort?: number;
  errorMessage?: string;
  sidebar: ModuleManifestSidebarItem[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload for POST /api/modules (install). */
export interface InstallModulePayload {
  moduleId: string;
  version: string;
  config?: Record<string, string>;
}

/** Payload for PATCH /api/modules/[moduleId] (update config). */
export interface UpdateModulePayload {
  config?: Record<string, string>;
}

/** Combined view: registry entry + install status. */
export interface ModuleCatalogEntry {
  registry: RegistryModule;
  installed: InstalledModuleResponse | null;
  updateAvailable: string | null;
}
