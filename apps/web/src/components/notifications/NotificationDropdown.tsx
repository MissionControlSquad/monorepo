"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  AlertCircle,
  MessageSquare,
  AtSign,
  FileText,
  UserPlus,
  HelpCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PushPermissionBanner } from "./PushPermissionBanner";
import type { NotificationItem } from "@agentcenter/types";

const TYPE_ICONS: Record<string, typeof CheckCircle> = {
  task_done: CheckCircle,
  task_needs_review: Clock,
  task_clarification_requested: HelpCircle,
  task_approved: CheckCircle,
  task_rejected: XCircle,
  new_comment: MessageSquare,
  mention: AtSign,
  deliverable_submitted: FileText,
  task_assigned: UserPlus,
};

const TYPE_COLORS: Record<string, string> = {
  task_done: "text-green-500",
  task_needs_review: "text-amber-500",
  task_clarification_requested: "text-blue-500",
  task_approved: "text-green-500",
  task_rejected: "text-red-500",
  new_comment: "text-muted-foreground",
  mention: "text-primary",
  deliverable_submitted: "text-purple-500",
  task_assigned: "text-blue-500",
};

interface NotificationDropdownProps {
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkOneRead: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationDropdown({
  notifications,
  onClose,
  onMarkOneRead,
  onMarkAllRead,
}: NotificationDropdownProps) {
  const router = useRouter();

  const handleClick = useCallback(
    async (n: NotificationItem) => {
      if (!n.readAt) {
        onMarkOneRead(n.id);
      }
      if (n.url) {
        router.push(n.url);
      }
      onClose();
    },
    [router, onClose, onMarkOneRead],
  );

  return (
    <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-background border border-border rounded-lg shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        <button
          onClick={onMarkAllRead}
          className="text-xs text-primary hover:text-primary/80 font-medium"
        >
          Mark all read
        </button>
      </div>

      <PushPermissionBanner />

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 && (
          <div className="py-8 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        )}

        {notifications.map((n) => {
          const Icon = TYPE_ICONS[n.type] || AlertCircle;
          const iconColor = TYPE_COLORS[n.type] || "text-muted-foreground";
          const isUnread = !n.readAt;

          return (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 flex gap-3 ${
                isUnread ? "bg-primary/5" : ""
              }`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm leading-snug ${isUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  {n.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
              {isUnread && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
