import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#0B0D0F] px-4 py-10">
      <div
        className={cn(
          "w-[calc(100%-32px)] max-w-[440px] rounded-[12px] border border-[#282E33] bg-[#111417] p-8 shadow-[0_16px_48px_rgba(0,0,0,0.35)] sm:w-[420px] sm:p-10",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AuthBrand() {
  return (
    <p className="text-center text-[15px] font-semibold tracking-tight text-[#F1F3F4]">
      BuildLens
    </p>
  );
}

export function AuthFieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-[13px] text-[#E8B4B4]" role="alert">
      {message}
    </p>
  );
}

export function AuthLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] font-medium text-[#F1F3F4]"
    >
      {children}
    </label>
  );
}
