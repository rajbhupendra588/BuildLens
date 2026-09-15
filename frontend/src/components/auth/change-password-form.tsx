"use client";

import { useState } from "react";
import { AuthApiError, changePasswordRequest } from "@/lib/auth-api";
import { isPasswordValid, passwordError } from "@/lib/auth-validation";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = "Current password is required.";
    const passErr = passwordError(newPassword);
    if (passErr) next.newPassword = passErr;
    if (newPassword !== confirmPassword) {
      next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    setSuccess(null);
    setFormError(null);
    if (Object.keys(next).length > 0 || !isPasswordValid(newPassword)) return;

    setSubmitting(true);
    try {
      const result = await changePasswordRequest({
        currentPassword,
        newPassword,
      });
      setSuccess(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      if (error instanceof AuthApiError) {
        setFormError(error.message);
      } else {
        setFormError("Unable to change password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form id="password" className="max-w-md space-y-4" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-medium">
          Current Password
        </label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={submitting}
        />
        {errors.currentPassword ? (
          <p className="mt-1 text-xs text-destructive">{errors.currentPassword}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-sm font-medium">
          New Password
        </label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={submitting}
        />
        <PasswordRequirements password={newPassword} />
        {errors.newPassword ? (
          <p className="mt-1 text-xs text-destructive">{errors.newPassword}</p>
        ) : null}
      </div>
      <div>
        <label htmlFor="confirmNewPassword" className="mb-1.5 block text-sm font-medium">
          Confirm New Password
        </label>
        <Input
          id="confirmNewPassword"
          name="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={submitting}
        />
        {errors.confirmPassword ? (
          <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
        ) : null}
      </div>
      {success ? (
        <p className="text-sm text-emerald-500" role="status">
          {success}
        </p>
      ) : null}
      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Change Password"}
      </Button>
    </form>
  );
}
