import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, Shield, Users, FolderKanban } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

export default async function LandingPage() {
  const { t } = await getServerT();
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[48rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/10 blur-3xl dark:bg-brand/[0.07]"
      />

      {/* Header */}
      <header className="relative z-10 border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <span className="text-xl font-bold text-foreground">
            {t("landing.appName")}
          </span>
          <Button asChild variant="outline">
            <Link href="/login">{t("landing.signIn")}</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="mx-auto max-w-2xl animate-slide-up space-y-6">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("landing.heroDesc")}
          </p>
          <div className="flex justify-center gap-4">
            <Button asChild size="lg" variant="brand" className="group">
              <Link href="/login">
                {t("landing.getStarted")}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Feature cards */}
        <div className="mx-auto mt-16 grid max-w-4xl gap-6 px-4 md:grid-cols-3">
          <FeatureCard
            icon={FolderKanban}
            title={t("landing.feature1Title")}
            description={t("landing.feature1Desc")}
            delay={80}
          />
          <FeatureCard
            icon={Users}
            title={t("landing.feature2Title")}
            description={t("landing.feature2Desc")}
            delay={160}
          />
          <FeatureCard
            icon={Shield}
            title={t("landing.feature3Title")}
            description={t("landing.feature3Desc")}
            delay={240}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-4">
          <p className="text-sm text-muted-foreground">
            {t("landing.footer")}
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
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <Card
      interactive
      className="animate-slide-up p-6 text-left [animation-fill-mode:backwards]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-muted text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mb-1 font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}
