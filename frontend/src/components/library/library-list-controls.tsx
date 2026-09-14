"use client";

import { ArrowDownAZ, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LIBRARY_KIND_FILTERS,
  LIBRARY_SORT_OPTIONS,
  LibraryKindFilter,
  LibrarySortKey,
} from "@/lib/library-document-utils";
import { cn } from "@/lib/utils";

interface LibraryListControlsProps {
  sortKey: LibrarySortKey;
  onSortChange: (key: LibrarySortKey) => void;
  kindFilter: LibraryKindFilter;
  onKindFilterChange: (kind: LibraryKindFilter) => void;
  className?: string;
}

export function LibraryListControls({
  sortKey,
  onSortChange,
  kindFilter,
  onKindFilterChange,
  className,
}: LibraryListControlsProps) {
  const sortLabel =
    LIBRARY_SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? "Sort";

  const kindLabel =
    kindFilter === "all"
      ? "All kinds"
      : kindFilter;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <Filter className="size-3.5 shrink-0 opacity-70" />
            <span className="max-w-[8rem] truncate sm:max-w-none">
              {kindLabel}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Filter by kind</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={kindFilter}
            onValueChange={(v) => onKindFilterChange(v as LibraryKindFilter)}
          >
            {LIBRARY_KIND_FILTERS.map((kind) => (
              <DropdownMenuRadioItem key={kind} value={kind}>
                {kind === "all" ? "All kinds" : kind}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <ArrowDownAZ className="size-3.5 shrink-0 opacity-70" />
            <span className="max-w-[10rem] truncate sm:max-w-none">
              {sortLabel}
            </span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={sortKey}
            onValueChange={(v) => onSortChange(v as LibrarySortKey)}
          >
            {LIBRARY_SORT_OPTIONS.map((opt) => (
              <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                {opt.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
