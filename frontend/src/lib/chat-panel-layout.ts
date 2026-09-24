import { cn } from "@/lib/utils";

const CHAT_RAIL_MAX = "max-w-[984px]";

/** Inner rail — use inside `chatPanelOuterClassName` wrapper. */
export function chatPanelWidthClassName(className?: string) {
  return cn(
    "mx-auto w-full min-w-0",
    CHAT_RAIL_MAX,
    "flex flex-col",
    className,
  );
}

/** Full-width shell with side padding (works inside ScrollArea). */
export function chatPanelOuterClassName(className?: string) {
  return cn("w-full px-4 md:px-5", className);
}

export function chatPanelContentClassName(className?: string) {
  return cn(
    chatPanelWidthClassName(),
    "pt-4 pb-6 md:pt-5",
    className,
  );
}
