"use client";

import { useState, useCallback } from "react";
import { Loader2, Shield, UserPlus } from "lucide-react";
import { Badge, Button } from "../ui";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { ProfilePickerDialog } from "../ui/ProfilePickerDialog";
import type { ProfilePickerItem } from "../ui/ProfilePickerDialog";
import type { ProfileWithAgent } from "@/lib/types";

interface ProjectMemberEditorProps {
  profiles: ProfileWithAgent[];
  selectedIds: string[];
  onToggle: (profileId: string) => Promise<void> | void;
  disabledIds?: string[];
}

export function ProjectMemberEditor({
  profiles,
  selectedIds,
  onToggle,
  disabledIds = [],
}: ProjectMemberEditorProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const handleRemove = async (profileId: string) => {
    if (loadingId) return;
    setLoadingId(profileId);
    try {
      await onToggle(profileId);
    } finally {
      setLoadingId(null);
    }
  };

  const leadProfiles = profiles.filter(
    (p) => disabledIds.includes(p.id) && selectedIds.includes(p.id),
  );
  const memberProfiles = profiles.filter(
    (p) => selectedIds.includes(p.id) && !disabledIds.includes(p.id),
  );
  const availableProfiles = profiles.filter(
    (p) => !selectedIds.includes(p.id) && !disabledIds.includes(p.id),
  );

  // Picker shows only non-member, non-lead profiles
  const pickerItems: ProfilePickerItem[] = availableProfiles.map((p) => ({
    id: p.id,
    name: p.displayName || p.username || p.id,
    subtitle: p.agent?.role || (p.kind === "agent" ? "Agent" : null),
    kind: p.kind === "agent" ? "agent" : "human",
    profileId: p.id,
  }));

  const handlePickerToggle = useCallback((item: ProfilePickerItem) => {
    setPendingIds((prev) =>
      prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id],
    );
  }, []);

  const handlePickerOpen = useCallback((open: boolean) => {
    setPickerOpen(open);
    if (!open) setPendingIds([]);
  }, []);

  const handleDone = useCallback(async () => {
    setPickerOpen(false);
    for (const id of pendingIds) {
      await onToggle(id);
    }
    setPendingIds([]);
  }, [pendingIds, onToggle]);

  return (
    <div className="space-y-4">
      {/* Lead */}
      {leadProfiles.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Project Lead
          </h4>
          <div className="space-y-1">
            {leadProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-warning-muted/60 border border-warning/15"
              >
                <ProfileAvatar profileId={profile.id} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {profile.displayName}
                    </span>
                    <Shield className="w-3.5 h-3.5 text-warning shrink-0" />
                  </div>
                  {profile.agent?.role && (
                    <p className="text-xs text-muted-foreground truncate">{profile.agent.role}</p>
                  )}
                </div>
                {profile.kind === "agent" && <Badge variant="yellow">Agent</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current members */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Members
            {memberProfiles.length > 0 && (
              <span className="ml-1.5 text-muted-foreground normal-case font-normal">
                ({memberProfiles.length})
              </span>
            )}
          </h4>
          {availableProfiles.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="gap-1.5 text-xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add members
            </Button>
          )}
        </div>
        {memberProfiles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No members added yet.</p>
        ) : (
          <div className="space-y-1">
            {memberProfiles.map((profile) => {
              const isLoading = loadingId === profile.id;
              return (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/80 border border-border group"
                >
                  <ProfileAvatar profileId={profile.id} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {profile.displayName}
                      </span>
                      {profile.kind === "agent" && <Badge variant="blue">Agent</Badge>}
                    </div>
                    {profile.agent?.role && (
                      <p className="text-xs text-muted-foreground truncate">{profile.agent.role}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => !isLoading && handleRemove(profile.id)}
                    disabled={isLoading}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs gap-1"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Remove"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Profile picker dialog */}
      <ProfilePickerDialog
        open={pickerOpen}
        onOpenChange={handlePickerOpen}
        title="Add team members"
        searchPlaceholder="Search by name or role..."
        emptyMessage="No available members found"
        items={pickerItems}
        selectedIds={pendingIds}
        mode="multi"
        onSelect={handlePickerToggle}
        onDone={handleDone}
        doneLabel="Add to project"
      />
    </div>
  );
}
