"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BlockReviseKind = "infographic" | "section";

export type BlockReviseTarget = {
  kind: BlockReviseKind;
  title: string;
  type?: string;
  index?: number;
};

export type BlockReviseRequest = BlockReviseTarget & {
  instruction: string;
};

type BlockReviseContextValue = {
  disabled: boolean;
  open: (target: BlockReviseTarget) => void;
};

const BlockReviseContext = createContext<BlockReviseContextValue | null>(null);

export function useBlockRevise() {
  return useContext(BlockReviseContext);
}

export function BlockReviseProvider({
  children,
  disabled,
  onSubmit,
}: {
  children: ReactNode;
  disabled?: boolean;
  onSubmit?: (request: BlockReviseRequest) => void | Promise<void>;
}) {
  const [target, setTarget] = useState<BlockReviseTarget | null>(null);
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const open = useCallback((next: BlockReviseTarget) => {
    if (disabled || !onSubmit) return;
    setTarget(next);
    setInstruction("");
  }, [disabled, onSubmit]);

  useEffect(() => {
    if (!target) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
  }, [target]);

  const close = () => {
    setTarget(null);
    setInstruction("");
  };

  const submit = async () => {
    const text = instruction.trim();
    if (!target || !text || !onSubmit) return;
    const payload: BlockReviseRequest = { ...target, instruction: text };
    close();
    await onSubmit(payload);
  };

  return (
    <BlockReviseContext.Provider value={{ disabled: Boolean(disabled || !onSubmit), open }}>
      {children}
      <Dialog open={Boolean(target)} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revise this block</DialogTitle>
            <DialogDescription>
              {target?.title
                ? `Update “${target.title}” only. The rest of the reply stays the same.`
                : "Describe how this block should change."}
            </DialogDescription>
          </DialogHeader>
          <textarea
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={4}
            placeholder="e.g. Add more detail, switch to a pie chart, shorten this, include dates…"
            className="min-h-[96px] w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={!instruction.trim()}
            >
              Revise with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BlockReviseContext.Provider>
  );
}

export function BlockReviseButton({
  target,
  className,
  tone = "default",
}: {
  target: BlockReviseTarget;
  className?: string;
  tone?: "default" | "onDark";
}) {
  const ctx = useBlockRevise();
  if (!ctx || ctx.disabled) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Edit this block"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            tone === "onDark"
              ? "text-white/85 hover:bg-white/15 hover:text-white"
              : "bg-background/70 hover:bg-muted",
            className,
          )}
          onClick={() => ctx.open(target)}
        >
          <Pencil className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">Edit this block</TooltipContent>
    </Tooltip>
  );
}

export function EditableBlockFrame({
  target,
  children,
  className,
}: {
  target: BlockReviseTarget;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useBlockRevise();
  if (!ctx || ctx.disabled) return <>{children}</>;
  return (
    <div className={cn("group/block relative", className)}>
      <div className="absolute right-0 top-0.5 z-10 opacity-50 transition-opacity duration-150 md:opacity-0 md:group-hover/block:opacity-100 group-focus-within/block:opacity-100">
        <BlockReviseButton target={target} />
      </div>
      {children}
    </div>
  );
}

export function plainTextFromNode(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainTextFromNode).join("");
  if (typeof node === "object" && "props" in node) {
    return plainTextFromNode(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}
