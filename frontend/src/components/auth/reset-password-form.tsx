"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthApiError, resetPasswordRequest } from "@/lib/auth-api";
import {
  isPasswordValid,
  passwordError,
} from "@/lib/auth-validation";
import {
  AuthBrand,
  AuthFieldError,
  AuthLabel,
  AuthShell,
} from "@/components/auth/auth-shell";
import { AuthSubmitButton, PasswordInput } from "@/components/auth/auth-fields";
import { PasswordRequirements } from "@/components/auth/password-requirements";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setFormError("This reset link is invalid or has expired.");
    }
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !token) return;

    const next: Record<string, string> = {};
    const passErr = passwordError(password);
    if (passErr) next.password = passErr;
    if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || !isPasswordValid(password)) return;

    setSubmitting(true);
    try {
      await resetPasswordRequest({ token, password });
      setSuccess(true);
    } catch (error) {
      if (error instanceof AuthApiError) {
        setFormError(error.message);
      } else {
        setFormError("Unable to reset password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <AuthShell>
        <AuthBrand />
        <h1 className="mt-6 text-center text-[22px] font-semibold tracking-tight text-[#F1F3F4]">
          Reset Password
        </h1>
        <p className="mt-6 text-center text-[14px] text-[#F1F3F4]" role="status">
          Your password has been reset successfully.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-md bg-[#F1F3F4] text-[14px] font-semibold text-[#0B0D0F]"
        >
          Sign In
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthBrand />
      <h1 className="mt-6 text-center text-[22px] font-semibold tracking-tight text-[#F1F3F4]">
        Reset Password
      </h1>

      <form className="mt-8" onSubmit={handleSubmit} noValidate>
        <div>
          <AuthLabel htmlFor="password">New Password</AuthLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting || !token}
          />
          <PasswordRequirements password={password} />
          <AuthFieldError message={errors.password} />
        </div>

        <div className="mt-5">
          <AuthLabel htmlFor="confirmPassword">Confirm Password</AuthLabel>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={submitting || !token}
          />
          <AuthFieldError message={errors.confirmPassword} />
        </div>

        {formError ? (
          <p className="mt-4 text-center text-[13px] text-[#E8B4B4]" role="alert">
            {formError}
          </p>
        ) : null}

        <AuthSubmitButton
          loading={submitting}
          disabled={submitting || !token || (Boolean(password) && password !== confirmPassword)}
        >
          {submitting ? "Resetting..." : "Reset Password"}
        </AuthSubmitButton>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#9AA3AA]">
        <Link href="/login" className="font-medium text-[#F1F3F4] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
