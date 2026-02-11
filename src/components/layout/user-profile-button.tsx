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
import type { CurrentUserResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface UserProfileButtonProps {
  user: CurrentUserResponse;
  collapsed: boolean;
}

export function UserProfileButton({ user, collapsed }: UserProfileButtonProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logoutAction();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3",
              collapsed && "justify-center px-0",
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
              <User className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col items-start text-left">
                <span className="text-sm font-medium">{user.username}</span>
                <span className="text-xs text-zinc-500">{user.email}</span>
              </div>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="font-medium">{user.username}</p>
            <p className="text-xs font-normal text-zinc-500">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Change Password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}>
            <LogOut className="mr-2 h-4 w-4" />
            {loggingOut ? "Logging out..." : "Logout"}
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
