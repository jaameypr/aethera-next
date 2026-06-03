"use client";

import { useState } from "react";
import { User, LogOut, KeyRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { UserProfileDialog } from "./user-profile-dialog";
import { logoutAction } from "@/app/(app)/actions/auth";
import { useLocale } from "@/context/locale-context";
import type { CurrentUserResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface UserProfileButtonProps {
  user: CurrentUserResponse;
  collapsed: boolean;
}

export function UserProfileButton({ user, collapsed }: UserProfileButtonProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { t } = useLocale();

  const handleLogout = async () => {
    setLoggingOut(true);
    await logoutAction();
  };

  const initials =
    (user.username ?? "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 transition-colors",
              collapsed && "justify-center px-0",
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand">
              {initials ?? <User className="h-4 w-4" />}
            </div>
            {!collapsed && (
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">{user.username}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand">
              {initials ?? <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{user.username}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            {t("profile.changePassword")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {loggingOut ? t("profile.loggingOut") : t("profile.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        userId={user._id}
      />
    </>
  );
}
