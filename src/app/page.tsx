import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Users, FolderKanban } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            Aethera
          </span>
          <Button asChild variant="outline">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Project Management Platform
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Manage your projects, servers, and team from a single dashboard.
            Built for developers, designed for productivity.
          </p>
          <div className="flex justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/login">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Feature cards */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-6 px-4 md:grid-cols-3">
          <FeatureCard
            icon={FolderKanban}
            title="Project Management"
            description="Organize and track your projects with an intuitive interface."
          />
          <FeatureCard
            icon={Users}
            title="Team Management"
            description="Role-based access control with granular permissions."
          />
          <FeatureCard
            icon={Shield}
            title="Secure by Default"
            description="JWT authentication, encrypted passwords, and secure sessions."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-4">
          <p className="text-sm text-zinc-500">
            Aethera &mdash; Project Management Platform
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-6 text-left dark:border-zinc-800">
      <Icon className="mb-3 h-8 w-8 text-zinc-700 dark:text-zinc-300" />
      <h3 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
        {title}
      </h3>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  );
}
