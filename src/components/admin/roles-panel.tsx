"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { PermissionListEditor } from "./permission-list-editor";
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
} from "@/app/(app)/actions/admin";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import type { AdminRoleResponse, PermissionEntry } from "@/lib/api/types";

interface AdminRolesPanelProps {
  initialRoles: AdminRoleResponse[];
}

export function AdminRolesPanel({ initialRoles }: AdminRolesPanelProps) {
  const [roles, setRoles] = useState(initialRoles);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<AdminRoleResponse | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminRoleResponse | null>(
    null,
  );

  // Create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPermissions, setNewPermissions] = useState<PermissionEntry[]>([]);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPermissions, setEditPermissions] = useState<PermissionEntry[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const resetCreateForm = () => {
    setNewName("");
    setNewDescription("");
    setNewPermissions([]);
  };

  const handleCreate = async () => {
    if (!newName) return;
    setCreateLoading(true);
    try {
      const role = await createRoleAction({
        name: newName,
        description: newDescription,
        permissions: newPermissions,
      });
      setRoles((prev) => [...prev, role]);
      toast.success(`Role "${newName}" created`);
      setCreateOpen(false);
      resetCreateForm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create role",
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (role: AdminRoleResponse) => {
    setEditRole(role);
    setEditName(role.name);
    setEditDescription(role.description);
    setEditPermissions(role.permissions);
  };

  const handleUpdate = async () => {
    if (!editRole) return;
    setEditLoading(true);
    try {
      const updated = await updateRoleAction(editRole._id, {
        name: editName,
        description: editDescription,
        permissions: editPermissions,
      });
      setRoles((prev) =>
        prev.map((r) => (r._id === editRole._id ? updated : r)),
      );
      toast.success("Role updated");
      setEditRole(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update role",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteRoleAction(deleteConfirm._id);
      setRoles((prev) => prev.filter((r) => r._id !== deleteConfirm._id));
      toast.success(`Role "${deleteConfirm.name}" deleted`);
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
            Roles
          </h1>
          <p className="text-zinc-500">Manage roles and permissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Role
        </Button>
      </div>

      {/* Roles list */}
      <div className="space-y-2">
        {roles.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <ShieldCheck className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-zinc-500">No roles found</p>
            </CardContent>
          </Card>
        )}
        {roles.map((role) => (
          <Card key={role._id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{role.name}</p>
                <p className="text-sm text-zinc-500">
                  {role.description || "No description"}
                </p>
                <p className="text-xs text-zinc-400">
                  {role.permissions.length} permission(s):{" "}
                  {role.permissions.map((p) => p.name).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(role)}
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteConfirm(role)}
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

      {/* Create Role Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>
              Define a new role with permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="role-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this role does"
              />
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
              {createLoading ? "Creating..." : "Create Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editRole} onOpenChange={() => setEditRole(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Update role details and permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <PermissionListEditor
              permissions={editPermissions}
              onChange={setEditPermissions}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={editLoading}>
              {editLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete role &quot;{deleteConfirm?.name}
              &quot;? This cannot be undone.
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
    </div>
  );
}
