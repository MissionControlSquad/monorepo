"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { AGENT_QUERY, AGENT_QUEUE_BY_AGENT_QUERY } from "../../lib/graphql/queries";
import { UPDATE_QUEUE_ITEM_STATUS } from "../../lib/graphql/mutations";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { X, CheckCircle2, Circle, Clock, AlertCircle, SkipForward, Play } from "lucide-react";
import { TimeAgo } from "../common/TimeAgo";
import { Button, Badge, Input } from "../ui";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import type { Agent, AgentQueueItem } from "@agentcenter/types";

interface AgentQueueDialogProps {
  agentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AgentQueueDialog({ agentId, isOpen, onClose }: AgentQueueDialogProps) {
  const [agentResult] = useQuery({
    query: AGENT_QUERY,
    variables: { id: agentId! },
    pause: !agentId,
  });
  const agent = agentResult.data?.agent as Agent;
  const [queueResult] = useQuery({
    query: AGENT_QUEUE_BY_AGENT_QUERY,
    variables: { agentId: agentId! },
    pause: !agentId,
  });
  const queueItems = queueResult.data?.agentQueueByAgent as AgentQueueItem[] | undefined;
  const [, executeUpdateStatus] = useMutation(UPDATE_QUEUE_ITEM_STATUS);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  if (!agentId) return null;

  const handleStatusChange = async (itemId: string, newStatus: string) => {
    try {
      await executeUpdateStatus({
        id: itemId,
        status: newStatus,
      });
      setActiveItemId(null);
    } catch {
      toast.error("Failed to update queue item");
    }
  };

  const handleAddNote = async (itemId: string) => {
    if (!noteInput.trim()) return;

    try {
      await executeUpdateStatus({
        id: itemId,
        status: queueItems?.find((item: AgentQueueItem) => item.id === itemId)?.status,
        notes: noteInput,
      });

      setNoteInput("");
      setActiveItemId(null);
    } catch {
      toast.error("Failed to update queue item");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case "in_progress":
        return <Play className="w-5 h-5 text-blue-600 animate-pulse" />;
      case "blocked":
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      case "skipped":
        return <SkipForward className="w-5 h-5 text-muted-foreground" />;
      default:
        return <Circle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-success-muted border-success/30";
      case "in_progress":
        return "bg-blue-50 border-blue-200";
      case "blocked":
        return "bg-destructive-muted border-destructive/30";
      case "skipped":
        return "bg-muted border-border";
      default:
        return "bg-background border-border";
    }
  };

  const PRIORITY_BADGE_VARIANT: Record<string, "red" | "orange" | "yellow" | "gray"> = {
    urgent: "red",
    high: "orange",
    medium: "yellow",
    low: "gray",
  };

  const getPriorityBadge = (priority: string) => {
    const variant = PRIORITY_BADGE_VARIANT[priority];
    if (!variant) return null;
    return <Badge variant={variant}>{priority.toUpperCase()}</Badge>;
  };

  // Group items by status
  const pendingItems =
    queueItems?.filter((item: AgentQueueItem) => item.status === "pending") || [];
  const inProgressItems =
    queueItems?.filter((item: AgentQueueItem) => item.status === "in_progress") || [];
  const completedItems =
    queueItems?.filter((item: AgentQueueItem) => item.status === "completed") || [];
  const otherItems =
    queueItems?.filter(
      (item: AgentQueueItem) =>
        item.status !== "pending" && item.status !== "in_progress" && item.status !== "completed",
    ) || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl sm:max-w-4xl p-0 gap-0 max-h-[90vh] flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border">
          <div className="flex items-center space-x-3 min-w-0">
            <ProfileAvatar agentId={agentId!} size="lg" className="sm:w-12 sm:h-12" />
            <div className="min-w-0">
              <DialogTitle className="text-lg sm:text-xl font-bold text-foreground truncate">
                {agent?.name}&apos;s Queue
              </DialogTitle>
              <p className="text-sm text-muted-foreground truncate">{agent?.role}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X />}
            onClick={onClose}
            className="shrink-0 ml-2"
          />
        </div>

        {/* Queue Stats */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-muted border-b border-border">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{queueItems?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Total Items</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{inProgressItems.length}</div>
              <div className="text-xs text-muted-foreground">In Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">{pendingItems.length}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{completedItems.length}</div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>
          </div>
        </div>

        {/* Queue Items */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!queueItems || queueItems.length === 0 ? (
            <div className="text-center py-12">
              <Circle className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-muted-foreground text-lg">No queue items yet</p>
              <p className="text-muted-foreground text-sm mt-2">
                Queue items will appear when {agent?.name} is assigned to tasks
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* In Progress Section */}
              {inProgressItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center space-x-2">
                    <Play className="w-4 h-4 text-blue-600" />
                    <span>In Progress</span>
                  </h3>
                  <div className="space-y-3">
                    {inProgressItems.map((item: AgentQueueItem) => (
                      <QueueItem
                        key={item.id}
                        item={item}
                        getStatusIcon={getStatusIcon}
                        getStatusColor={getStatusColor}
                        getPriorityBadge={getPriorityBadge}
                        activeItemId={activeItemId}
                        setActiveItemId={setActiveItemId}
                        handleStatusChange={handleStatusChange}
                        noteInput={noteInput}
                        setNoteInput={setNoteInput}
                        handleAddNote={handleAddNote}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Section */}
              {pendingItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-warning" />
                    <span>Pending</span>
                  </h3>
                  <div className="space-y-3">
                    {pendingItems.map((item: AgentQueueItem) => (
                      <QueueItem
                        key={item.id}
                        item={item}
                        getStatusIcon={getStatusIcon}
                        getStatusColor={getStatusColor}
                        getPriorityBadge={getPriorityBadge}
                        activeItemId={activeItemId}
                        setActiveItemId={setActiveItemId}
                        handleStatusChange={handleStatusChange}
                        noteInput={noteInput}
                        setNoteInput={setNoteInput}
                        handleAddNote={handleAddNote}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Section */}
              {completedItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span>Completed</span>
                  </h3>
                  <div className="space-y-3">
                    {completedItems.map((item: AgentQueueItem) => (
                      <QueueItem
                        key={item.id}
                        item={item}
                        getStatusIcon={getStatusIcon}
                        getStatusColor={getStatusColor}
                        getPriorityBadge={getPriorityBadge}
                        activeItemId={activeItemId}
                        setActiveItemId={setActiveItemId}
                        handleStatusChange={handleStatusChange}
                        noteInput={noteInput}
                        setNoteInput={setNoteInput}
                        handleAddNote={handleAddNote}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Items (blocked/skipped) */}
              {otherItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Other</h3>
                  <div className="space-y-3">
                    {otherItems.map((item: AgentQueueItem) => (
                      <QueueItem
                        key={item.id}
                        item={item}
                        getStatusIcon={getStatusIcon}
                        getStatusColor={getStatusColor}
                        getPriorityBadge={getPriorityBadge}
                        activeItemId={activeItemId}
                        setActiveItemId={setActiveItemId}
                        handleStatusChange={handleStatusChange}
                        noteInput={noteInput}
                        setNoteInput={setNoteInput}
                        handleAddNote={handleAddNote}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Queue Item Component
function QueueItem({
  item,
  getStatusIcon,
  getStatusColor,
  getPriorityBadge,
  activeItemId,
  setActiveItemId,
  handleStatusChange,
  noteInput,
  setNoteInput,
  handleAddNote,
}: {
  item: AgentQueueItem;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusColor: (status: string) => string;
  getPriorityBadge: (priority: string) => React.ReactNode;
  activeItemId: string | null;
  setActiveItemId: (id: string | null) => void;
  handleStatusChange: (itemId: string, newStatus: string) => Promise<void>;
  noteInput: string;
  setNoteInput: (value: string) => void;
  handleAddNote: (itemId: string) => Promise<void>;
}) {
  const isActive = activeItemId === item.id;

  return (
    <div className={`border rounded-lg p-4 transition ${getStatusColor(item.status)}`}>
      <div className="flex items-start space-x-3">
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon(item.status)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title & Priority */}
          <div className="flex items-start justify-between mb-2">
            <h4
              className={`text-sm font-medium ${
                item.status === "completed"
                  ? "line-through text-muted-foreground"
                  : "text-foreground"
              }`}
            >
              {item.title}
            </h4>
            {getPriorityBadge(item.priority)}
          </div>

          {/* Description */}
          {item.description && (
            <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="bg-background/50 rounded p-2 mb-2 border border-border">
              <p className="text-xs text-foreground whitespace-pre-wrap">{item.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center flex-wrap gap-1 sm:space-x-3 text-xs text-muted-foreground mb-2">
            <span>
              Created <TimeAgo date={item.createdAt!} />
            </span>
            {item.startedAt && (
              <span>
                • Started <TimeAgo date={item.startedAt} />
              </span>
            )}
            {item.completedAt && (
              <span>
                • Completed <TimeAgo date={item.completedAt} />
              </span>
            )}
          </div>

          {/* Actions */}
          {item.status !== "completed" && (
            <div className="flex items-center flex-wrap gap-2">
              {!isActive ? (
                <>
                  {item.status === "pending" && (
                    <Button size="sm" onClick={() => handleStatusChange(item.id, "in_progress")}>
                      Start
                    </Button>
                  )}
                  {item.status === "in_progress" && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(item.id, "completed")}
                      className="bg-success hover:bg-success"
                    >
                      Complete
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => setActiveItemId(item.id)}>
                    Add Note
                  </Button>
                </>
              ) : (
                <div className="flex items-center space-x-2 w-full">
                  <Input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Add a note..."
                    autoFocus
                    className="flex-1 text-xs py-1"
                  />
                  <Button size="sm" onClick={() => handleAddNote(item.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setActiveItemId(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
