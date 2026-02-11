import { requireSession } from "@/lib/auth/guards";
import { getUserById } from "@/lib/services/user.service";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FolderKanban, Server, Users } from "lucide-react";

export default async function DashboardPage() {
  const session = await requireSession();
  const user = await getUserById(session.userId);

  const stats = [
    {
      label: "Projects",
      value: 0,
      icon: FolderKanban,
      description: "Coming soon",
    },
    {
      label: "Servers",
      value: 0,
      icon: Server,
      description: "Coming soon",
    },
    {
      label: "Team Members",
      value: 0,
      icon: Users,
      description: "Active users",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Welcome back, {user?.username || "User"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-500">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-zinc-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-zinc-500">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
