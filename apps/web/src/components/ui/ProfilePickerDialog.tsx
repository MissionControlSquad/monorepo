"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, Check, Loader2 } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/shadcn/dialog";
import { ProfileAvatar } from "./ProfileAvatar";

export interface ProfilePickerItem {
  /** Unique identifier — could be profileId or agentId */
  id: string;
  /** Primary display name */
  name: string;
  /** Optional subtitle (e.g. "@username", role, "Online") */
  subtitle?: string | null;
  /** Drives the Agent/Human badge */
  kind?: "agent" | "human";
  /** For ProfileAvatar lookup by profile */
  profileId?: string;
  /** For ProfileAvatar lookup by agent */
  agentId?: string;
  /** Show green online indicator dot */
  isOnline?: boolean;
  /** Dim/grayscale the avatar */
  isOffline?: boolean;
}

export interface ProfilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  items: ProfilePickerItem[];
  loading?: boolean;
  onSelect: (item: ProfilePickerItem) => void;
  selectedIds?: string[];
  mode?: "single" | "multi";
  /** Called when confirm button is clicked in multi mode. If provided, uses this instead of just closing. */
  onDone?: () => void;
  /** Label for the confirm button in multi mode. Defaults to "Done". */
  doneLabel?: string;
}

export function ProfilePickerDialog({
  open,
  onOpenChange,
  title,
  searchPlaceholder = "Search...",
  emptyMessage = "No results found",
  items,
  loading = false,
  onSelect,
  selectedIds = [],
  mode = "single",
  onDone,
  doneLabel = "Done",
}: ProfilePickerDialogProps) {
  const [search, setSearch] = useState("");

  // Reset search when dialog opens/closes
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const handleSelect = (item: ProfilePickerItem) => {
    onSelect(item);
    if (mode === "single") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="max-w-sm p-0 gap-0 flex flex-col max-h-[70vh]">
        <DialogHeader className="shrink-0 px-4 pt-4 pb-0">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="shrink-0 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground text-foreground"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                        isSelected ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-muted"
                      }`}
                    >
                      <div className="relative shrink-0">
                        <ProfileAvatar
                          profileId={item.profileId}
                          agentId={item.agentId}
                          size="md"
                          className={item.isOffline ? "opacity-60 grayscale" : ""}
                        />
                        {item.isOnline && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-success rounded-full ring-2 ring-white" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-foreground truncate">{item.name}</p>
                          {item.kind && (
                            <Badge
                              variant={item.kind === "agent" ? "indigo" : "gray"}
                              size="sm"
                              className="shrink-0"
                            >
                              {item.kind === "agent" ? "Agent" : "Human"}
                            </Badge>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer for multi mode */}
        {mode === "multi" && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => {
                if (onDone) {
                  onDone();
                } else {
                  onOpenChange(false);
                }
              }}
            >
              {doneLabel}
              {selectedIds.length > 0 && ` (${selectedIds.length})`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
