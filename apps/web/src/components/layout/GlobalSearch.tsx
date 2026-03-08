"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "urql";
import { Search, X, FileText, MessageSquare, Package, Loader2 } from "lucide-react";
import { GLOBAL_SEARCH_QUERY } from "../../lib/graphql/queries";
import { useDebounce } from "../../hooks/useDebounce";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useDeliverableNavigation } from "../../hooks/useDeliverableNavigation";
import { useCurrentProject } from "../context/AppContext";
import { MentionText } from "../common/MarkdownWithMentions";
import { StatusPill } from "../ui/StatusPill";
import { Badge } from "../ui/Badge";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import { Button } from "../ui";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/shadcn/popover";
import type { TaskStatus } from "@/lib/types";

interface SearchTask {
  _id: string;
  taskNumber?: number;
  title: string;
  status: TaskStatus;
}

interface SearchMessage {
  _id: string;
  taskId: string;
  taskNumber?: number;
  taskTitle?: string;
  content?: string;
}

interface SearchDeliverable {
  _id: string;
  title: string;
  kind: string;
  taskNumber?: number;
  taskTitle?: string;
}

type ResultItem =
  | { type: "task"; id: string; data: SearchTask }
  | { type: "message"; id: string; data: SearchMessage }
  | { type: "deliverable"; id: string; data: SearchDeliverable };

const KIND_BADGE_VARIANT: Record<string, "blue" | "purple" | "green" | "orange"> = {
  markdown: "blue",
  code: "purple",
  file: "green",
  link: "orange",
};

export function GlobalSearch() {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { projectId } = useCurrentProject();

  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedText = useDebounce(searchText, 300);
  const [searchResult] = useQuery({
    query: GLOBAL_SEARCH_QUERY,
    variables: { searchText: debouncedText.trim(), projectId: projectId ?? undefined },
    pause: !debouncedText.trim(),
  });
  const results = searchResult.data?.globalSearch;

  const openTask = useTaskNavigation();
  const openDeliverable = useDeliverableNavigation();
  // Build flat list of all result items for keyboard navigation
  const flatItems: ResultItem[] = [];
  if (results) {
    for (const task of results.tasks) {
      flatItems.push({ type: "task", id: task._id, data: task });
    }
    for (const msg of results.messages) {
      flatItems.push({ type: "message", id: msg._id, data: msg });
    }
    for (const del of results.deliverables) {
      flatItems.push({ type: "deliverable", id: del._id, data: del });
    }
  }

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(-1);
  }, [debouncedText]);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const navigateToItem = useCallback(
    (item: ResultItem) => {
      if (item.type === "task") {
        openTask(item.data.taskNumber ?? item.data._id);
      } else if (item.type === "message") {
        // Navigate to the parent task
        openTask(item.data.taskNumber ?? item.data.taskId);
      } else if (item.type === "deliverable") {
        openDeliverable(item.data._id);
      }
      setSearchText("");
      setIsOpen(false);
    },
    [openTask, openDeliverable],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
      setMobileOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1));
      return;
    }

    if (e.key === "Enter" && highlightIndex >= 0 && highlightIndex < flatItems.length) {
      e.preventDefault();
      navigateToItem(flatItems[highlightIndex]);
    }
  }

  const isLoading = debouncedText.trim() && results === undefined;
  const hasResults = results && flatItems.length > 0;
  const showNoResults = results && flatItems.length === 0 && debouncedText.trim();
  const showDropdown = isOpen && debouncedText.trim();

  let currentFlatIndex = -1;

  return (
    <Popover
      open={!!showDropdown}
      onOpenChange={(open) => {
        if (!open) setIsOpen(false);
      }}
    >
      <div className="relative w-full">
        {/* Mobile search icon — visible only on small screens when search is collapsed */}
        {!mobileOpen && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setMobileOpen(true);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="sm:hidden text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Open search"
          >
            <Search className="w-5 h-5" />
          </Button>
        )}

        {/* Search Input — always visible on sm+, toggled on mobile */}
        <PopoverAnchor asChild>
          <div className={`relative ${mobileOpen ? "block" : "hidden sm:block"}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <ShadcnInput
              ref={inputRef}
              type="text"
              placeholder="Search tasks, messages, deliverables..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-9 py-2 text-sm rounded-xl bg-muted focus:bg-background"
            />
            {searchText ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setSearchText("");
                  setIsOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </Button>
            ) : (
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted border border-border rounded">
                ⌘K
              </kbd>
            )}
          </div>
        </PopoverAnchor>

        {/* Results Dropdown */}
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-[var(--radix-popover-trigger-width)] max-h-[420px] overflow-y-auto p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          )}

          {showNoResults && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No results found
            </div>
          )}

          {hasResults && (
            <div className="py-1">
              {/* Tasks */}
              {results.tasks.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tasks
                  </div>
                  {results.tasks.map((task: SearchTask) => {
                    currentFlatIndex++;
                    const idx = currentFlatIndex;
                    return (
                      <button
                        key={task._id}
                        onClick={() => navigateToItem({ type: "task", id: task._id, data: task })}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition rounded-lg ${
                          highlightIndex === idx ? "bg-indigo-50 text-indigo-900" : "hover:bg-muted"
                        }`}
                      >
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground shrink-0">#{task.taskNumber}</span>
                        <span className="truncate flex-1 text-foreground">{task.title}</span>
                        <StatusPill status={task.status} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Messages */}
              {results.messages.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Messages
                  </div>
                  {results.messages.map((msg: SearchMessage) => {
                    currentFlatIndex++;
                    const idx = currentFlatIndex;
                    return (
                      <button
                        key={msg._id}
                        onClick={() => navigateToItem({ type: "message", id: msg._id, data: msg })}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={`w-full text-left flex items-start gap-2.5 px-3 py-2 text-sm transition rounded-lg ${
                          highlightIndex === idx ? "bg-indigo-50 text-indigo-900" : "hover:bg-muted"
                        }`}
                      >
                        <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-foreground">
                            <MentionText content={msg.content ?? ""} />
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            in #{msg.taskNumber}: {msg.taskTitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Deliverables */}
              {results.deliverables.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Deliverables
                  </div>
                  {results.deliverables.map((del: SearchDeliverable) => {
                    currentFlatIndex++;
                    const idx = currentFlatIndex;
                    return (
                      <button
                        key={del._id}
                        onClick={() =>
                          navigateToItem({
                            type: "deliverable",
                            id: del._id,
                            data: del,
                          })
                        }
                        onMouseEnter={() => setHighlightIndex(idx)}
                        className={`w-full text-left flex items-start gap-2.5 px-3 py-2 text-sm transition rounded-lg ${
                          highlightIndex === idx ? "bg-indigo-50 text-indigo-900" : "hover:bg-muted"
                        }`}
                      >
                        <Package className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-foreground">{del.title}</span>
                            <Badge variant={KIND_BADGE_VARIANT[del.kind] ?? "gray"}>
                              {del.kind}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            in #{del.taskNumber}: {del.taskTitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </div>
    </Popover>
  );
}
