import { listAllRoles } from "@/lib/services/role.service";
import { AdminRolesPanel } from "@/components/admin/roles-panel";

export default async function AdminRolesPage() {
  const roles = await listAllRoles();

  return <AdminRolesPanel initialRoles={JSON.parse(JSON.stringify(roles))} />;
}
