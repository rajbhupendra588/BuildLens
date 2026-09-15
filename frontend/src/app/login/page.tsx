import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { AuthSplash } from "@/components/auth/require-auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSplash />}>
      <LoginForm />
    </Suspense>
  );
}
