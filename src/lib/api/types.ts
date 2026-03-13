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
