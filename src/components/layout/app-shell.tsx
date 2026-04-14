"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Upload,
  HardDrive,
  Files,
  FolderKanban,
  ChevronLeft,
  Menu,
  Puzzle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { UserProfileButton } from "./user-profile-button";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useLocale } from "@/context/locale-context";
import type { CurrentUserResponse } from "@/lib/api/types";

export interface ModuleSidebarItem {
  moduleId: string;
  label: string;
  icon: string;
  description?: string;
  type: "docker" | "code";
}

interface AppShellProps {
  children: React.ReactNode;
  currentUser: CurrentUserResponse;
  projects?: Array<{ _id: string; key: string; name: string }>;
  moduleItems?: ModuleSidebarItem[];
}

export function AppShell({ children, currentUser, projects, moduleItems }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLocale();

  const navGroups = [
    {
      title: t("nav.workspace"),
      items: [
        { label: t("nav.dashboard"), href: "/dashboard", icon: LayoutDashboard },
        { label: t("nav.projects"), href: "/projects", icon: FolderKanban },
      ],
    },
    {
      title: t("nav.verzeichnis"),
      items: [
        { label: t("nav.upload"), href: "/verzeichnis/upload", icon: Upload },
        { label: t("nav.backups"), href: "/verzeichnis/backups", icon: HardDrive },
        { label: t("nav.files"), href: "/verzeichnis/dateien", icon: Files },
      ],
    },
    {
      title: t("nav.admin"),
      items: [
        { label: t("nav.users"), href: "/admin/users", icon: Users },
        { label: t("nav.roles"), href: "/admin/roles", icon: ShieldCheck },
        { label: t("nav.modules"), href: "/admin/modules", icon: Puzzle },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:z-auto",
          collapsed ? "w-16" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Logo / Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
          {!collapsed && (
            <Link
              href="/dashboard"
              className="text-lg font-bold text-zinc-900 dark:text-zinc-50"
            >
              Aethera
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex"
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {navGroups.map((group) => (
            <div key={group.title} className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {group.title}
                </p>
              )}
              {collapsed && <Separator className="mb-2" />}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
                        collapsed && "justify-center px-0",
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Module-Links */}
          {moduleItems && moduleItems.length > 0 && (
            <div className="mb-4">
              {!collapsed && (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t("nav.modulesSection")}
                </p>
              )}
              {collapsed && <Separator className="mb-2" />}
              <div className="flex flex-col gap-0.5">
                {moduleItems.map((item) => (
                  <a
                    key={item.moduleId}
                    href={
                      item.type === "docker"
                        ? `/api/modules/${item.moduleId}/launch`
                        : `/modules/${item.moduleId}`
                    }
                    target={item.type === "docker" ? "_blank" : undefined}
                    rel={item.type === "docker" ? "noopener noreferrer" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
                      collapsed && "justify-center px-0",
                    )}
                    title={collapsed ? item.label : item.description}
                  >
                    <Puzzle className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                    {!collapsed && item.type === "docker" && (
                      <ExternalLink className="ml-auto h-3 w-3 text-zinc-400" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Projekt-Links */}
          {!collapsed && (
            <div className="mb-4">
              <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {t("nav.projectsSection")}
              </p>
              {projects && projects.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {projects.map((project) => {
                    const href = `/projects/${project.key}`;
                    const isActive = pathname === href || pathname.startsWith(href + "/");
                    return (
                      <Link
                        key={project._id}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                            : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
                        )}
                      >
                        <FolderKanban className="h-4 w-4 shrink-0" />
                        <span className="truncate">{project.name}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="px-3 py-2 text-xs text-zinc-400 dark:text-zinc-500">
                  {t("nav.noProjects")}
                </p>
              )}
            </div>
          )}
        </nav>

        {/* Bottom: theme + language switcher + user profile */}
        <div className="border-t border-zinc-200 p-2 dark:border-zinc-800 space-y-1">
          {!collapsed && (
            <div className="px-1 flex items-center gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher className="flex-1 justify-start" />
            </div>
          )}
          {collapsed && (
            <div className="flex flex-col items-center gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher compact />
            </div>
          )}
          <UserProfileButton user={currentUser} collapsed={collapsed} />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center border-b border-zinc-200 px-4 lg:hidden dark:border-zinc-800">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-3 text-lg font-bold">Aethera</span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
