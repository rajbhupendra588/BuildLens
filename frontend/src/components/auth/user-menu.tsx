"use client";

import { useRouter } from "next/navigation";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { displayName } from "@/lib/auth-validation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const name = displayName(user.firstName, user.lastName);

  const handleSignOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-9 max-w-[200px] gap-2 rounded-full px-2"
          aria-label="User menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
            {user.firstName.slice(0, 1).toUpperCase()}
            {user.lastName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden truncate text-[13px] font-medium sm:inline">
            {name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{user.username}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/app/profile")}>
          <UserRound className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/app/profile#password")}>
          <KeyRound className="size-4" />
          Change Password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void handleSignOut()}>
          <LogOut className="size-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
