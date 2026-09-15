"use client";

import { SidebarInset } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { displayName } from "@/lib/auth-validation";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { UserMenu } from "@/components/auth/user-menu";

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <SidebarInset className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Profile</h1>
          <p className="text-xs text-muted-foreground">
            Account details and password
          </p>
        </div>
        <UserMenu />
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <section className="mb-10 max-w-md space-y-2">
          <h2 className="text-sm font-semibold">Account</h2>
          <p className="text-sm">{displayName(user.firstName, user.lastName)}</p>
          <p className="text-sm text-muted-foreground">{user.username}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Change Password</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </SidebarInset>
  );
}
