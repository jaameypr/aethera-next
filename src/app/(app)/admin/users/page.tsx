import { listAllUsers } from "@/lib/services/user.service";
import { listAllRoles } from "@/lib/services/role.service";
import { AdminUsersPanel } from "@/components/admin/users-panel";

export default async function AdminUsersPage() {
  const [users, roles] = await Promise.all([listAllUsers(), listAllRoles()]);

  return (
    <AdminUsersPanel
      initialUsers={JSON.parse(JSON.stringify(users))}
      roles={JSON.parse(JSON.stringify(roles))}
    />
  );
}
