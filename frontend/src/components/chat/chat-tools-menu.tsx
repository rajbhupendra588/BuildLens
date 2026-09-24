"use client";

import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applySlashCommandSelection,
  CHAT_TOOL_CATEGORIES,
  commandsForCategory,
  type ChatSlashCommand,
} from "@/lib/chat-slash-commands";
import { cn } from "@/lib/utils";

interface ChatToolsMenuProps {
  disabled?: boolean;
  onInsert: (text: string) => void;
  /** Compact icon-only trigger for dialogs */
  compact?: boolean;
  className?: string;
}

function ToolMenuItem({
  cmd,
  onSelect,
}: {
  cmd: ChatSlashCommand;
  onSelect: (cmd: ChatSlashCommand) => void;
}) {
  return (
    <DropdownMenuItem
      className="flex cursor-pointer items-start gap-3 py-2.5"
      onSelect={() => onSelect(cmd)}
    >
      <span className="text-base leading-none" aria-hidden="true">
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
    </DropdownMenuItem>
  );
}

export function ChatToolsMenu({
  disabled,
  onInsert,
  compact,
  className,
}: ChatToolsMenuProps) {
  const handleSelect = (cmd: ChatSlashCommand) => {
    onInsert(applySlashCommandSelection(cmd));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            compact
              ? "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              : "size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground",
            className,
          )}
          disabled={disabled}
          title="Tools"
        >
          <Wrench className={compact ? "size-4" : "size-5"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(24rem,70vh)] w-80 overflow-y-auto"
      >
        {CHAT_TOOL_CATEGORIES.map((section, sectionIndex) => (
          <div key={section.id}>
            {sectionIndex > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {section.label}
            </DropdownMenuLabel>
            {commandsForCategory(section.id).map((cmd) => (
              <ToolMenuItem key={cmd.name} cmd={cmd} onSelect={handleSelect} />
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
