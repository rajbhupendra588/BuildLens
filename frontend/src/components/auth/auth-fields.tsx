"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<
  React.ComponentProps<"input">,
  "type"
> & {
  toggleLabelShow?: string;
  toggleLabelHide?: string;
};

export function PasswordInput({
  className,
  toggleLabelShow = "Show password",
  toggleLabelHide = "Hide password",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        spellCheck={false}
        className={cn(
          "h-11 w-full rounded-md border border-[#282E33] bg-[#0B0D0F] px-3 pr-11 text-[15px] text-[#F1F3F4] outline-none transition-colors",
          "placeholder:text-[#68727A]",
          "focus-visible:border-[#5B9FD4] focus-visible:ring-2 focus-visible:ring-[#5B9FD4]/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "aria-invalid:border-[#E8B4B4]",
          className,
        )}
      />
      <button
        type="button"
        tabIndex={0}
        aria-label={visible ? toggleLabelHide : toggleLabelShow}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#9AA3AA] hover:text-[#F1F3F4]"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function AuthTextInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-md border border-[#282E33] bg-[#0B0D0F] px-3 text-[15px] text-[#F1F3F4] outline-none transition-colors",
        "placeholder:text-[#68727A]",
        "focus-visible:border-[#5B9FD4] focus-visible:ring-2 focus-visible:ring-[#5B9FD4]/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-[#E8B4B4]",
        className,
      )}
    />
  );
}

export function AuthSubmitButton({
  children,
  loading,
  disabled,
  ...props
}: React.ComponentProps<"button"> & { loading?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="mt-2 flex h-11 w-full items-center justify-center rounded-md bg-[#F1F3F4] text-[14px] font-semibold text-[#0B0D0F] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {children}
    </button>
  );
}
