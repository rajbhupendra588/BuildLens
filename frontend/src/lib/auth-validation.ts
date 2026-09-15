import type { PasswordChecks } from "@/types/auth";

export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._]{2,49}$/;

export function usernameError(username: string): string | null {
  const value = username.trim();
  if (!value) return "Username is required.";
  if (!USERNAME_PATTERN.test(value)) {
    return "Username must be 3–50 characters and may contain letters, numbers, underscores, and periods.";
  }
  return null;
}

export function passwordChecks(password: string): PasswordChecks {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const checks = passwordChecks(password);
  return (
    checks.length &&
    checks.uppercase &&
    checks.lowercase &&
    checks.number &&
    checks.special
  );
}

export function passwordError(password: string): string | null {
  if (!password) return "Password is required.";
  const checks = passwordChecks(password);
  if (!checks.length) return "Password must be at least 12 characters.";
  if (!checks.uppercase) return "Password must include an uppercase letter.";
  if (!checks.lowercase) return "Password must include a lowercase letter.";
  if (!checks.number) return "Password must include a number.";
  if (!checks.special) return "Password must include a special character.";
  return null;
}

export function displayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}
