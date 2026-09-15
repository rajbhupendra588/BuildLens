"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { useAuth } from "@/hooks/use-auth";
import {
  AuthBrand,
  AuthFieldError,
  AuthLabel,
  AuthShell,
} from "@/components/auth/auth-shell";
import {
  AuthSubmitButton,
  AuthTextInput,
  PasswordInput,
} from "@/components/auth/auth-fields";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const created = searchParams.get("created") === "1";

  useEffect(() => {
    if (!loading && user) {
      router.replace("/app");
    }
  }, [loading, user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextUsernameError = username.trim() ? null : "Username is required.";
    const nextPasswordError = password ? null : "Password is required.";
    setUsernameError(nextUsernameError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextUsernameError || nextPasswordError) return;

    setSubmitting(true);
    try {
      await login(username.trim(), password);
      router.replace("/app");
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 429) {
        setFormError(error.message);
      } else if (error instanceof AuthApiError) {
        setFormError("Invalid username or password.");
      } else if (error instanceof Error && error.message) {
        setFormError(error.message);
      } else {
        setFormError("Unable to sign in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <AuthBrand />
      <h1 className="mt-6 text-center text-[22px] font-semibold tracking-tight text-[#F1F3F4]">
        Welcome back
      </h1>
      <p className="mt-2 text-center text-[14px] text-[#9AA3AA]">
        Sign in to continue to BuildLens
      </p>
      {created ? (
        <p className="mt-4 text-center text-[13px] text-[#7DCEA0]">
          Account created. Sign in to continue.
        </p>
      ) : null}

      <form className="mt-8" onSubmit={handleSubmit} noValidate>
        <div>
          <AuthLabel htmlFor="username">Username</AuthLabel>
          <AuthTextInput
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Enter your username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (usernameError) setUsernameError(null);
            }}
            aria-invalid={Boolean(usernameError)}
            disabled={submitting}
          />
          <AuthFieldError message={usernameError} />
        </div>

        <div className="mt-5">
          <AuthLabel htmlFor="password">Password</AuthLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
            aria-invalid={Boolean(passwordError)}
            disabled={submitting}
          />
          <AuthFieldError message={passwordError} />
        </div>

        <div className="mt-3 flex justify-end">
          <Link
            href="/forgot-password"
            className="text-[13px] text-[#9AA3AA] hover:text-[#F1F3F4]"
          >
            Forgot password?
          </Link>
        </div>

        {formError ? (
          <p className="mt-4 text-center text-[13px] text-[#E8B4B4]" role="alert">
            {formError}
          </p>
        ) : null}

        <AuthSubmitButton loading={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </AuthSubmitButton>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#9AA3AA]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-[#F1F3F4] hover:underline">
          Create account
        </Link>
      </p>
    </AuthShell>
  );
}
