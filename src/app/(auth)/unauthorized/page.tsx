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

export default function UnauthorizedPage() {
  return (
    <Card className="text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <CardTitle>Access Denied</CardTitle>
        <CardDescription>
          You do not have permission to access this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-500">
          Contact your administrator if you believe this is an error.
        </p>
      </CardContent>
      <CardFooter className="justify-center">
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
