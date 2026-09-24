import { getApiOrigin } from "@/lib/api";
import type { AuthUser } from "@/types/auth";

const AUTH_BASE = () => `${getApiOrigin()}/api/auth`;

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function readDetail(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({}));
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    const first = data.detail[0];
    if (typeof first === "string") return first;
    if (first && typeof first.msg === "string") return first.msg;
  }
  if (typeof data.message === "string") return data.message;
  return response.statusText || "Request failed.";
}

async function authRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body != null && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${AUTH_BASE()}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    throw new AuthApiError(await readDetail(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function signupRequest(body: {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
}): Promise<{ message: string; user: AuthUser }> {
  return authRequest("/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function loginRequest(body: {
  username: string;
  password: string;
}): Promise<AuthUser> {
  return authRequest("/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch(`${AUTH_BASE()}/me`, {
    credentials: "include",
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new AuthApiError(await readDetail(response), response.status);
  }
  return response.json();
}

export async function logoutRequest(): Promise<void> {
  await authRequest("/logout", { method: "POST" });
}

export async function forgotPasswordRequest(username: string): Promise<{
  message: string;
  resetUrl?: string | null;
}> {
  return authRequest("/forgot-password", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export async function resetPasswordRequest(body: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  return authRequest("/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function changePasswordRequest(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  return authRequest("/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
