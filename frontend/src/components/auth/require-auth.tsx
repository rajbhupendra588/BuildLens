"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function AuthSplash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#0B0D0F] text-[#9AA3AA]">
      <p className="text-sm">Loading…</p>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) return <AuthSplash />;
  if (!user) return <AuthSplash />;
  return <>{children}</>;
}
