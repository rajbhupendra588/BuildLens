"use client";

import { cn } from "@/lib/utils";
import type { ChatSlashCommand } from "@/lib/chat-slash-commands";

interface SlashCommandMenuProps {
  commands: ChatSlashCommand[];
  activeIndex: number;
  onSelect: (command: ChatSlashCommand) => void;
  onHighlight: (index: number) => void;
}

export function SlashCommandMenu({
  commands,
  activeIndex,
  onSelect,
  onHighlight,
}: SlashCommandMenuProps) {
  if (commands.length === 0) {
    return (
      <div
        role="listbox"
        aria-label="Slash commands"
        className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg"
      >
        <p className="px-2 py-3 text-xs text-muted-foreground">
          No matching commands
        </p>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="border-b px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Commands
        </p>
      </div>
      <ul className="max-h-56 overflow-y-auto p-1">
        {commands.map((cmd, index) => {
          const selected = index === activeIndex;
          return (
            <li key={cmd.name} role="option" aria-selected={selected}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50",
                )}
                onMouseEnter={() => onHighlight(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(cmd);
                }}
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {cmd.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">/{cmd.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {cmd.label}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                    {cmd.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
