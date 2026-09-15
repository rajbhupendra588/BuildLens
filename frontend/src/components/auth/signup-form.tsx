"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthApiError, signupRequest } from "@/lib/auth-api";
import { useAuth } from "@/hooks/use-auth";
import {
  isPasswordValid,
  passwordError,
  usernameError,
} from "@/lib/auth-validation";
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
import { PasswordRequirements } from "@/components/auth/password-requirements";

export function SignupForm() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
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

    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "First name is required.";
    if (!lastName.trim()) next.lastName = "Last name is required.";
    const userErr = usernameError(username);
    if (userErr) next.username = userErr;
    const passErr = passwordError(password);
    if (passErr) next.password = passErr;
    if (password !== confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;
    if (!isPasswordValid(password)) return;

    setSubmitting(true);
    try {
      await signupRequest({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        password,
      });
      router.replace("/login?created=1");
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 409) {
        setErrors({ username: "Username is already in use." });
      } else if (error instanceof AuthApiError) {
        setFormError(error.message);
      } else {
        setFormError("Unable to create account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <AuthBrand />
      <h1 className="mt-6 text-center text-[22px] font-semibold tracking-tight text-[#F1F3F4]">
        Create your account
      </h1>

      <form className="mt-8" onSubmit={handleSubmit} noValidate>
        <div>
          <AuthLabel htmlFor="firstName">First Name</AuthLabel>
          <AuthTextInput
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            placeholder="Enter first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-invalid={Boolean(errors.firstName)}
            disabled={submitting}
          />
          <AuthFieldError message={errors.firstName} />
        </div>

        <div className="mt-5">
          <AuthLabel htmlFor="lastName">Last Name</AuthLabel>
          <AuthTextInput
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            placeholder="Enter last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            aria-invalid={Boolean(errors.lastName)}
            disabled={submitting}
          />
          <AuthFieldError message={errors.lastName} />
        </div>

        <div className="mt-5">
          <AuthLabel htmlFor="username">Username</AuthLabel>
          <AuthTextInput
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Choose username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={Boolean(errors.username)}
            disabled={submitting}
          />
          <AuthFieldError message={errors.username} />
        </div>

        <div className="mt-5">
          <AuthLabel htmlFor="password">Password</AuthLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="Create password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(errors.password)}
            disabled={submitting}
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
            aria-invalid={Boolean(errors.confirmPassword)}
            disabled={submitting}
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
          disabled={submitting || (Boolean(password) && password !== confirmPassword)}
        >
          {submitting ? "Creating account..." : "Create Account"}
        </AuthSubmitButton>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#9AA3AA]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#F1F3F4] hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
