import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

export default async function UnauthorizedPage() {
  const { t } = await getServerT();
  return (
    <Card className="text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <CardTitle>{t("auth.unauthorized.title")}</CardTitle>
        <CardDescription>
          {t("auth.unauthorized.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-500">
          {t("auth.unauthorized.description")}
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Button asChild variant="outline">
          <Link href="/dashboard">{t("auth.unauthorized.backHome")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
