"use client";

import { useState, type ReactNode } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "./Button";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfilePickerDialog } from "./ProfilePickerDialog";
import type { ProfilePickerItem } from "./ProfilePickerDialog";

export interface ProfileChipPickerProps {
  items: ProfilePickerItem[];
  selectedIds: string[];
  onAdd: (ids: string[]) => void;
  onRemove: (id: string) => void;
  label?: string;
  dialogTitle?: string;
  doneLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  renderChip?: (item: ProfilePickerItem, onRemove: () => void) => ReactNode;
}

export function ProfileChipPicker({
  items,
  selectedIds,
  onAdd,
  onRemove,
  label = "Add",
  dialogTitle = "Select",
  doneLabel = "Done",
  searchPlaceholder,
  emptyMessage,
  renderChip,
}: ProfileChipPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const handleOpen = () => {
    setPendingIds([]);
    setPickerOpen(true);
  };

  const handleToggle = (item: ProfilePickerItem) => {
    setPendingIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    );
  };

  const handleDone = () => {
    if (pendingIds.length > 0) {
      onAdd(pendingIds);
    }
    setPendingIds([]);
    setPickerOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    setPickerOpen(open);
    if (!open) {
      setPendingIds([]);
    }
  };

  const pickerItems = items.filter((item) => !selectedIds.includes(item.id));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.map((id) => {
          const item = items.find((i) => i.id === id);
          if (!item) return null;

          if (renderChip) {
            return <span key={id}>{renderChip(item, () => onRemove(id))}</span>;
          }

          return (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
            >
              <ProfileAvatar profileId={item.profileId} agentId={item.agentId} size="xs" />
              {item.name}
              <button
                type="button"
                onClick={() => onRemove(id)}
                className="ml-0.5 text-blue-400 hover:text-destructive transition-colors"
                aria-label={`Remove ${item.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleOpen}
          className="gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          {label}
        </Button>
      </div>

      <ProfilePickerDialog
        open={pickerOpen}
        onOpenChange={handleOpenChange}
        title={dialogTitle}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        items={pickerItems}
        selectedIds={pendingIds}
        mode="multi"
        onSelect={handleToggle}
        onDone={handleDone}
        doneLabel={doneLabel}
      />
    </>
  );
}
