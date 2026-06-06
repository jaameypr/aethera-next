export const dynamic = "force-dynamic";

import { requirePermission } from "@/lib/auth/guards";
import { getAuditLog, getAuditFilterOptions } from "@/lib/services/audit.service";
import { AuditLogPanel } from "@/components/admin/audit-log-panel";

const PAGE_SIZE = 30;

export default async function AdminAuditLogPage() {
  await requirePermission("admin.system");

  const [options, initial] = await Promise.all([
    getAuditFilterOptions(),
    getAuditLog({ page: 1, size: PAGE_SIZE, sort: "desc" }),
  ]);

  return (
    <AuditLogPanel
      options={options}
      initialEntries={initial.entries}
      initialTotal={initial.total}
      pageSize={PAGE_SIZE}
    />
  );
}
