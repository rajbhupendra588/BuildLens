export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  status: "ACTIVE" | "LOCKED" | "DISABLED" | string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type PasswordChecks = {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
};
