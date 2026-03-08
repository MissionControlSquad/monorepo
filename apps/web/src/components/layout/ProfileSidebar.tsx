"use client";

import Link from "next/link";
import { useQuery } from "urql";
import {
  PROFILE_QUERY,
  CHANNELS_IN_COMMON_QUERY,
  TASKS_BY_ASSIGNEE_QUERY,
} from "../../lib/graphql/queries";
import { useProfileSidebar } from "../context/ProfileSidebarContext";
import { useAppContext } from "../context/AppContext";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { User, Bot, Lock, MessageCircle, ClipboardList } from "lucide-react";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { MentionText } from "../common/MarkdownWithMentions";
import { Badge } from "@/components/ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";

interface ProfileSidebarProps {
  onClose: () => void;
  mounted: boolean;
}

const RECENT_TASKS_LIMIT = 10;
const STATUS_LABEL: Record<string, string> = {
  inbox: "Inbox",
  assigned: "Assigned",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

export function ProfileSidebar({ onClose, mounted }: ProfileSidebarProps) {
  const { openProfileId } = useProfileSidebar();
  const { currentUserProfile } = useAppContext();
  const openTask = useTaskNavigation();
  const isOpen = !!openProfileId;
  const isOtherUser =
    openProfileId && currentUserProfile?.id && openProfileId !== currentUserProfile.id;

  const [result] = useQuery({
    query: PROFILE_QUERY,
    variables: { id: openProfileId ?? "" },
    pause: !openProfileId,
  });

  const [channelsResult] = useQuery({
    query: CHANNELS_IN_COMMON_QUERY,
    variables: {
      myProfileId: currentUserProfile?.id ?? "",
      otherProfileId: openProfileId ?? "",
      limit: 20,
    },
    pause: !isOtherUser || !openProfileId || !currentUserProfile?.id,
  });

  const profile = result.data?.profile;
  const channelsInCommon = channelsResult.data?.channelsInCommon ?? [];
  const isAgentProfile = profile?.kind === "agent" && profile?.agent?.id;

  const [tasksResult] = useQuery({
    query: TASKS_BY_ASSIGNEE_QUERY,
    variables: {
      agentId: profile?.agent?.id ?? "",
      includeDone: true,
      limit: RECENT_TASKS_LIMIT,
    },
    pause: !isAgentProfile,
  });

  const recentTasks =
    (tasksResult.data?.tasksByAssignee as Array<{
      id: string;
      taskNumber: number | null;
      title: string;
      description: string | null;
      status: string;
    }>) ?? [];

  if (!mounted) return null;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" showCloseButton className="w-full sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-4 py-4 border-b border-border">
          <SheetTitle className="text-sm">Profile</SheetTitle>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {!openProfileId ? null : result.fetching && !profile ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-border border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading profile...</p>
            </div>
          ) : profile ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <ProfileAvatar profileId={openProfileId!} size="2xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold text-foreground truncate">
                    {profile.displayName}
                  </p>
                  {profile.username && (
                    <p className="text-sm text-muted-foreground truncate">@{profile.username}</p>
                  )}
                  <span className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    {profile.kind === "agent" ? (
                      <>
                        <Bot className="w-3.5 h-3.5" />
                        Agent
                        {profile.agent?.role && (
                          <span className="text-muted-foreground">· {profile.agent.role}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5" />
                        Human
                      </>
                    )}
                  </span>
                </div>
              </div>

              {profile.bio && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Bio
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{profile.bio}</p>
                </div>
              )}

              {profile.kind === "agent" && profile.agent?.name && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Agent
                  </h3>
                  <p className="text-sm text-foreground">{profile.agent.name}</p>
                  {profile.agent.status && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Status: {profile.agent.status}
                    </p>
                  )}
                </div>
              )}

              {isAgentProfile && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Recent tasks
                  </h3>
                  {tasksResult.fetching && recentTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : recentTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tasks assigned</p>
                  ) : (
                    <ul className="space-y-2">
                      {recentTasks.map((task) => (
                        <li key={task.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              requestAnimationFrame(() => {
                                openTask(task.taskNumber ?? task.id);
                              });
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-border hover:bg-muted transition-colors"
                          >
                            <p className="text-sm font-medium text-foreground truncate">
                              {task.title || "Untitled"}
                            </p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                <MentionText content={task.description} />
                              </p>
                            )}
                            <Badge variant="gray" size="sm" className="mt-1.5">
                              {STATUS_LABEL[task.status] ?? task.status}
                            </Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {isOtherUser && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5" />
                    Channels in common
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    Private channels you&apos;re both in
                  </p>
                  {channelsResult.fetching && channelsInCommon.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : channelsInCommon.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No private channels in common</p>
                  ) : (
                    <ul className="space-y-1">
                      {channelsInCommon.map(
                        (ch: { id: string; name: string; slug: string; visibility: string }) => (
                          <li key={ch.id}>
                            <Link
                              href={`/channels/${ch.slug}`}
                              onClick={onClose}
                              className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground hover:bg-muted rounded-lg transition-colors"
                            >
                              <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{ch.name}</span>
                            </Link>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">Profile not found</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
