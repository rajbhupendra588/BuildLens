import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthSplash } from "@/components/auth/require-auth";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthSplash />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
