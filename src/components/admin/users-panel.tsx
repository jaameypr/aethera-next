"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyableField } from "@/components/ui/copyable-field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PermissionListEditor } from "./permission-list-editor";
import {
  createUserAction,
  updateUserAction,
  deleteUserAction,
  enableUserAction,
  disableUserAction,
  resetUserPasswordAction,
} from "@/app/(app)/actions/admin";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Users,
} from "lucide-react";
import type { AdminUserResponse, AdminRoleResponse, PermissionEntry } from "@/lib/api/types";

interface AdminUsersPanelProps {
  initialUsers: AdminUserResponse[];
  roles: AdminRoleResponse[];
}

export function AdminUsersPanel({ initialUsers, roles }: AdminUsersPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserResponse | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUserResponse | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{
    tempPassword: string;
    emailSent: boolean;
    username: string;
  } | null>(null);

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEnabled, setNewEnabled] = useState(true);
  const [newRoles, setNewRoles] = useState<string[]>([]);
  const [newPermissions, setNewPermissions] = useState<PermissionEntry[]>([]);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit form state
  const [editUsername, setEditUsername] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPermissions, setEditPermissions] = useState<PermissionEntry[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const resetCreateForm = () => {
    setNewUsername("");
    setNewEmail("");
    setNewPassword("");
    setNewEnabled(true);
    setNewRoles([]);
    setNewPermissions([]);
  };

  const handleCreate = async () => {
    if (!newUsername) return;
    setCreateLoading(true);
    try {
      const result = await createUserAction({
        username: newUsername,
        email: newEmail || undefined,
        password: newPassword || undefined,
        enabled: newEnabled,
        roles: newRoles,
        permissions: newPermissions,
      });
      setUsers((prev) => [result.user, ...prev]);

      if (result.tempPassword) {
        setTempPasswordResult({
          tempPassword: result.tempPassword,
          emailSent: result.emailSent || false,
          username: newUsername,
        });
      }

      toast.success(`User "${newUsername}" created`);
      setCreateOpen(false);
      resetCreateForm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create user",
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (user: AdminUserResponse) => {
    setEditUser(user);
    setEditUsername(user.username);
    setEditEmail(user.email);
    setEditRoles(user.roles);
    setEditPermissions(user.permissions);
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    setEditLoading(true);
    try {
      const updated = await updateUserAction(editUser._id, {
        username: editUsername,
        email: editEmail,
        roles: editRoles,
        permissions: editPermissions,
      });
      setUsers((prev) =>
        prev.map((u) => (u._id === editUser._id ? updated : u)),
      );
      toast.success("User updated");
      setEditUser(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update user",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleToggle = async (user: AdminUserResponse) => {
    try {
      if (user.enabled) {
        await disableUserAction(user._id);
      } else {
        await enableUserAction(user._id);
      }
      setUsers((prev) =>
        prev.map((u) =>
          u._id === user._id ? { ...u, enabled: !u.enabled } : u,
        ),
      );
      toast.success(
        `User "${user.username}" ${user.enabled ? "disabled" : "enabled"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleResetPassword = async (user: AdminUserResponse) => {
    try {
      const result = await resetUserPasswordAction(user._id);
      setTempPasswordResult({
        tempPassword: result.tempPassword,
        emailSent: result.emailSent,
        username: user.username,
      });
      toast.success("Password reset");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteUserAction(deleteConfirm._id);
      setUsers((prev) => prev.filter((u) => u._id !== deleteConfirm._id));
      toast.success(`User "${deleteConfirm.username}" deleted`);
      setDeleteConfirm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            Users
          </h1>
          <p className="text-zinc-500">Manage user accounts</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {users.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Users className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-zinc-500">No users found</p>
            </CardContent>
          </Card>
        )}
        {users.map((user) => (
          <Card key={user._id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{user.username}</p>
                  <StatusBadge variant={user.enabled ? "enabled" : "disabled"}>
                    {user.enabled ? "Active" : "Disabled"}
                  </StatusBadge>
                </div>
                <p className="text-sm text-zinc-500">{user.email}</p>
                {user.roles.length > 0 && (
                  <p className="text-xs text-zinc-400">
                    Roles: {user.roles.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Switch
                  checked={user.enabled}
                  onCheckedChange={() => handleToggle(user)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleResetPassword(user)}
                  title="Reset Password"
                >
                  <KeyRound className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(user)}
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteConfirm(user)}
                  title="Delete"
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Create a new user account. Leave password empty to generate a
              temporary password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="username"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Password (optional)</Label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave empty for temp password"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newEnabled}
                onCheckedChange={setNewEnabled}
              />
              <Label>Enabled</Label>
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role._id} className="flex items-center gap-2">
                    <Checkbox
                      checked={newRoles.includes(role.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setNewRoles([...newRoles, role.name]);
                        } else {
                          setNewRoles(newRoles.filter((r) => r !== role.name));
                        }
                      }}
                    />
                    <Label className="font-normal">{role.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <PermissionListEditor
              permissions={newPermissions}
              onChange={setNewPermissions}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createLoading}>
              {createLoading ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details and permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="space-y-2">
                {roles.map((role) => (
                  <div key={role._id} className="flex items-center gap-2">
                    <Checkbox
                      checked={editRoles.includes(role.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEditRoles([...editRoles, role.name]);
                        } else {
                          setEditRoles(
                            editRoles.filter((r) => r !== role.name),
                          );
                        }
                      }}
                    />
                    <Label className="font-normal">{role.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <PermissionListEditor
              permissions={editPermissions}
              onChange={setEditPermissions}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={editLoading}>
              {editLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user &quot;{deleteConfirm?.username}
              &quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Temp Password Dialog */}
      <Dialog
        open={!!tempPasswordResult}
        onOpenChange={() => setTempPasswordResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary Password</DialogTitle>
            <DialogDescription>
              {tempPasswordResult?.emailSent
                ? `A password reset email has been sent to the user. The temporary password is also shown below for your reference.`
                : `SMTP is not configured. Please share the temporary password with "${tempPasswordResult?.username}" manually.`}
            </DialogDescription>
          </DialogHeader>
          {tempPasswordResult && (
            <CopyableField
              label="Temporary Password"
              value={tempPasswordResult.tempPassword}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setTempPasswordResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
