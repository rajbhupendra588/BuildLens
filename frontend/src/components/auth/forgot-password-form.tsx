"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthApiError, forgotPasswordRequest } from "@/lib/auth-api";
import { useAuth } from "@/hooks/use-auth";
import {
  AuthBrand,
  AuthFieldError,
  AuthLabel,
  AuthShell,
} from "@/components/auth/auth-shell";
import { AuthSubmitButton, AuthTextInput } from "@/components/auth/auth-fields";

export function ForgotPasswordForm() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/app");
    }
  }, [loading, user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!username.trim()) {
      setUsernameError("Username is required.");
      return;
    }
    setUsernameError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await forgotPasswordRequest(username.trim());
      setSubmitted(true);
      setResetUrl(result.resetUrl ?? null);
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 429) {
        setFormError(error.message);
      } else {
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <AuthBrand />
      <h1 className="mt-6 text-center text-[22px] font-semibold tracking-tight text-[#F1F3F4]">
        Reset your password
      </h1>
      <p className="mt-2 text-center text-[14px] text-[#9AA3AA]">
        Enter your username and we&apos;ll send reset instructions.
      </p>

      {submitted ? (
        <div className="mt-8 space-y-4">
          <p className="text-center text-[14px] text-[#F1F3F4]" role="status">
            If the account exists, password reset instructions have been sent.
          </p>
          {resetUrl ? (
            <p className="text-center text-[12px] text-[#68727A]">
              Development reset link:{" "}
              <Link href={resetUrl} className="text-[#9AA3AA] underline">
                Reset Password
              </Link>
            </p>
          ) : null}
          <Link
            href="/login"
            className="flex h-11 items-center justify-center rounded-md bg-[#F1F3F4] text-[14px] font-semibold text-[#0B0D0F]"
          >
            Sign In
          </Link>
        </div>
      ) : (
        <form className="mt-8" onSubmit={handleSubmit} noValidate>
          <div>
            <AuthLabel htmlFor="username">Username</AuthLabel>
            <AuthTextInput
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={Boolean(usernameError)}
              disabled={submitting}
            />
            <AuthFieldError message={usernameError} />
          </div>
          {formError ? (
            <p className="mt-4 text-center text-[13px] text-[#E8B4B4]" role="alert">
              {formError}
            </p>
          ) : null}
          <AuthSubmitButton loading={submitting}>
            {submitting ? "Sending..." : "Send Reset Instructions"}
          </AuthSubmitButton>
        </form>
      )}

      <p className="mt-6 text-center text-[13px] text-[#9AA3AA]">
        <Link href="/login" className="font-medium text-[#F1F3F4] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
