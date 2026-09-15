"use client";

import { Check } from "lucide-react";
import { passwordChecks } from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

const RULES: { key: keyof ReturnType<typeof passwordChecks>; label: string }[] =
  [
    { key: "length", label: "At least 12 characters" },
    { key: "uppercase", label: "Uppercase letter" },
    { key: "lowercase", label: "Lowercase letter" },
    { key: "number", label: "Number" },
    { key: "special", label: "Special character" },
  ];

export function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[12px] font-medium text-[#9AA3AA]">
        Password requirements
      </p>
      <ul className="space-y-1">
        {RULES.map((rule) => {
          const ok = checks[rule.key];
          return (
            <li
              key={rule.key}
              className={cn(
                "flex items-center gap-2 text-[12px]",
                ok ? "text-[#7DCEA0]" : "text-[#68727A]",
              )}
            >
              <Check
                className={cn("size-3.5", ok ? "opacity-100" : "opacity-40")}
                aria-hidden="true"
              />
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
