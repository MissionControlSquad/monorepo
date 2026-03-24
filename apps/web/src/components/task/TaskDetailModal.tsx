"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  X,
  Calendar,
  User,
  Zap,
  Pencil,
  Check,
  WifiOff,
  Tag,
  RotateCcw,
  Package,
  MessageCircle,
  Plus,
  Clock,
  Flag,
  ArrowUpRight,
  GitBranch,
  LayoutTemplate,
  Copy,
  FolderKanban,
  Link2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useQuery, useMutation } from "urql";
import {
  AGENTS_QUERY,
  PROJECT_QUERY,
  PROJECTS_QUERY,
  DELIVERABLES_BY_TASK_QUERY,
  MESSAGES_BY_TASK_QUERY,
  TASK_WORK_SUMMARY_QUERY,
  TASK_QUERY,
  CHILD_TASKS_QUERY,
  TASKS_QUERY,
} from "../../lib/graphql/queries";
import {
  UPDATE_TASK,
  SAVE_TASK_AS_TEMPLATE,
  APPROVE_TASK,
  REJECT_TASK,
  REQUEST_CLARIFICATION,
} from "../../lib/graphql/mutations";
import { useAppContext } from "../context/AppContext";
import { TaskComments } from "./TaskComments";
import { TaskDeliverables } from "./TaskDeliverables";
import { ChildTaskDeliverables } from "./ChildTaskDeliverables";
import { ErrorBoundary, PanelErrorFallback } from "../common/ErrorBoundary";
import { MarkdownWithMentions } from "../common/MarkdownWithMentions";
import { MarkdownEditor } from "../common/MarkdownEditor";
import { HEARTBEAT_TIMEOUT_MS } from "../../lib/constants";
import { format } from "date-fns";
import { TimeAgo } from "../common/TimeAgo";
import { CopyButton } from "../common/CopyButton";
import { useTaskList } from "../context/TaskListContext";
import { Button, Badge, StatusPill, PrioritySelect, DueDatePill } from "../ui";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";

import { ProfileAvatar } from "../ui/ProfileAvatar";
import { ProfilePickerDialog } from "../ui/ProfilePickerDialog";
import type { ProfilePickerItem } from "../ui/ProfilePickerDialog";
import type {
  TaskDetail,
  Agent,
  TaskAssignee,
  TaskMessage,
  ProjectMember,
  Project,
  TaskListItem,
  TaskStatus,
  Priority,
} from "@agentcenter/types";

interface TaskDetailModalProps {
  task: TaskDetail | null;
  isOpen: boolean;
  onClose: () => void;
  openInEditMode?: boolean;
  onOpenTask?: (taskIdentifier: number | string, options?: { replace?: boolean }) => void;
}

function formatWorkTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function TaskDetailModal({
  task,
  isOpen,
  onClose,
  openInEditMode = false,
  onOpenTask,
}: TaskDetailModalProps) {
  // Get task ID
  const taskId = (task as TaskDetail & { _id?: string })?._id ?? task?.id;
  const taskProjectId = task?.projectId;

  const { currentUserProfile } = useAppContext();
  const [, executeUpdateTask] = useMutation(UPDATE_TASK);
  const [, executeSaveAsTemplate] = useMutation(SAVE_TASK_AS_TEMPLATE);
  const [, executeApproveTask] = useMutation(APPROVE_TASK);
  const [, executeRejectTask] = useMutation(REJECT_TASK);
  const [, executeRequestClarification] = useMutation(REQUEST_CLARIFICATION);

  // Approval UI state
  const [approvalLoading, setApprovalLoading] = useState<"approve" | "reject" | "clarify" | null>(
    null,
  );
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectChanges, setRejectChanges] = useState("");
  const [showClarifyDialog, setShowClarifyDialog] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState("");

  async function handleApproveTask(comment?: string) {
    if (!currentUserProfile?.id || !taskId) return;
    setApprovalLoading("approve");
    try {
      const res = await executeApproveTask({
        reviewerId: currentUserProfile.id,
        taskId,
        approvalComment: comment || undefined,
      });
      if (res.error) toast.error(res.error.message ?? "Failed to approve task");
    } finally {
      setApprovalLoading(null);
    }
  }

  async function handleRejectTask() {
    if (!currentUserProfile?.id || !taskId || !rejectReason.trim()) return;
    const changes = rejectChanges
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    setApprovalLoading("reject");
    setShowRejectDialog(false);
    try {
      const res = await executeRejectTask({
        reviewerId: currentUserProfile.id,
        taskId,
        rejectionReason: rejectReason,
        changesNeeded: changes,
      });
      if (res.error) toast.error(res.error.message ?? "Failed to reject task");
      else {
        setRejectReason("");
        setRejectChanges("");
      }
    } finally {
      setApprovalLoading(null);
    }
  }

  async function handleClarifyTask() {
    if (!currentUserProfile?.id || !taskId || !clarifyQuestions.trim()) return;
    const questions = clarifyQuestions
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);
    setApprovalLoading("clarify");
    setShowClarifyDialog(false);
    try {
      const res = await executeRequestClarification({
        reviewerId: currentUserProfile.id,
        taskId,
        questions,
      });
      if (res.error) toast.error(res.error.message ?? "Failed to request clarification");
      else setClarifyQuestions("");
    } finally {
      setApprovalLoading(null);
    }
  }

  const [agentsResult] = useQuery({ query: AGENTS_QUERY });
  const agents = agentsResult.data?.agents;

  const [projectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: taskProjectId },
    pause: !taskProjectId,
  });
  const taskProject = projectResult.data?.project;

  // Fetch all projects for assigning when task has no project
  const [projectsResult] = useQuery({
    query: PROJECTS_QUERY,
    pause: !!taskProjectId,
  });
  const allProjects = projectsResult.data?.projects;

  const [isEditing, setIsEditing] = useState(openInEditMode);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Inline editing state for sidebar
  const [editDueDate, setEditDueDate] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showBlockedByPicker, setShowBlockedByPicker] = useState(false);
  const [mobileTab, setMobileTab] = useState<
    "description" | "details" | "deliverables" | "activity"
  >("description");

  const [deliverablesResult] = useQuery({
    query: DELIVERABLES_BY_TASK_QUERY,
    variables: { taskId },
    pause: !taskId,
  });
  const deliverables = deliverablesResult.data?.deliverablesByTask;

  const [messagesResult] = useQuery({
    query: MESSAGES_BY_TASK_QUERY,
    variables: { taskId },
    pause: !taskId,
  });
  const messages = messagesResult.data?.messagesByTask;

  const [workSummaryResult] = useQuery({
    query: TASK_WORK_SUMMARY_QUERY,
    variables: { taskId },
    pause: !taskId,
  });
  const workSummary = workSummaryResult.data?.taskWorkSummary;

  const parentTaskId = task?.parentTaskId;
  const [parentTaskResult] = useQuery({
    query: TASK_QUERY,
    variables: { id: parentTaskId },
    pause: !parentTaskId,
  });
  const parentTask = parentTaskResult.data?.task;

  const [childTasksResult] = useQuery({
    query: CHILD_TASKS_QUERY,
    variables: { parentTaskId: taskId },
    pause: !taskId,
  });
  const childTasks = childTasksResult.data?.childTasks;

  const [projectTasksResult] = useQuery({
    query: TASKS_QUERY,
    variables: { projectId: taskProjectId },
    pause: !taskProjectId,
  });
  const projectTasks = projectTasksResult.data?.tasks;

  useEffect(() => {
    if (isOpen && task && openInEditMode) {
      setIsEditing(true);
      setEditTitle(task.title);
      setEditDescription(task.description ?? "");
    } else if (!isOpen) {
      setIsEditing(false);
      setEditTitle("");
      setEditDescription("");
      setEditDueDate("");
      setTagInput("");
      setShowAgentDropdown(false);
      setShowBlockedByPicker(false);
      setMobileTab("description");
    }
  }, [isOpen, task, openInEditMode]);

  // Sync due date edit state when task changes
  useEffect(() => {
    if (task?.dueDate) {
      setEditDueDate(format(new Date(task.dueDate), "yyyy-MM-dd"));
    } else {
      setEditDueDate("");
    }
  }, [task?.dueDate]);

  // Prev/next task navigation
  const taskListCtx = useTaskList();
  const prevTask = taskId ? (taskListCtx?.getPrev(taskId) ?? null) : null;
  const nextTask = taskId ? (taskListCtx?.getNext(taskId) ?? null) : null;

  const goToPrev = useCallback(() => {
    if (prevTask && onOpenTask) onOpenTask(prevTask.taskNumber ?? prevTask.id, { replace: true });
  }, [prevTask, onOpenTask]);

  const goToNext = useCallback(() => {
    if (nextTask && onOpenTask) onOpenTask(nextTask.taskNumber ?? nextTask.id, { replace: true });
  }, [nextTask, onOpenTask]);

  // Keyboard navigation: left/right arrows for prev/next
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Don't navigate when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable)
        return;
      if (e.key === "ArrowLeft" && prevTask) {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowRight" && nextTask) {
        e.preventDefault();
        goToNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, prevTask, nextTask, goToPrev, goToNext]);

  if (!task) return null;
  const resolvedTaskId = taskId!;

  const workingAgents = agents?.filter((agent: Agent) => agent.currentTaskId === taskId) || [];

  // Resolve assigneeIds — still use agentIds for mutation compat (backend resolves to profileId)
  const assigneeIds: string[] =
    (task as TaskDetail & { assigneeIds?: string[] }).assigneeIds ??
    task.assignees?.map(
      (a: TaskAssignee) =>
        a.profile?.agentId ?? a.profile?.agent?.id ?? (a as any).agentId ?? (a as any).agent?.id,
    ) ??
    [];

  const handleStartEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditTitle("");
    setEditDescription("");
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) {
      toast.error("Title cannot be empty");
      return;
    }

    try {
      const result = await executeUpdateTask({
        id: taskId,
        title: editTitle,
        description: editDescription,
      });
      if (result.error) throw result.error;
      setIsEditing(false);
      toast.success("Task updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update task");
    }
  };

  const handleStatusChange = (newStatus: string) => {
    executeUpdateTask({
      id: taskId,
      status: newStatus,
    });
  };

  const handlePriorityChange = (newPriority: string) => {
    executeUpdateTask({
      id: taskId,
      priority: newPriority,
    });
  };

  const handleAddAssignee = (agentId: string) => {
    const currentIds = [...assigneeIds];
    if (!currentIds.includes(agentId)) {
      executeUpdateTask({
        id: taskId,
        assigneeIds: [...currentIds, agentId],
      });
    }
    setShowAgentDropdown(false);
  };

  const handleRemoveAssignee = (agentId: string) => {
    const currentIds = [...assigneeIds];
    executeUpdateTask({
      id: taskId,
      assigneeIds: currentIds.filter((id) => id !== agentId),
    });
  };

  const handleAddTag = () => {
    const newTag = tagInput.trim();
    if (newTag && !(task.tags || []).includes(newTag)) {
      executeUpdateTask({
        id: taskId,
        tags: [...(task.tags || []), newTag],
      });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    executeUpdateTask({
      id: taskId,
      tags: (task.tags || []).filter((t: string) => t !== tag),
    });
  };

  const handleSetBlockedBy = (blockedByTaskId: string | null) => {
    executeUpdateTask({
      id: taskId,
      blockedByTaskId,
    });
    setShowBlockedByPicker(false);
  };

  const handleDueDateChange = (dateStr: string) => {
    setEditDueDate(dateStr);
    if (dateStr) {
      executeUpdateTask({
        id: taskId,
        dueDate: new Date(dateStr).getTime().toString(),
      });
    }
  };

  const handleCopyActivity = () => {
    if (!messages || messages.length === 0) {
      toast.error("No activity to copy");
      return;
    }

    const taskLabel = task.taskNumber ? `#${task.taskNumber} ${task.title}` : task.title;

    const header = `## Activity Timeline — ${taskLabel}\n\n`;
    const timeline = messages
      .map((msg: TaskMessage) => {
        const name = msg.fromProfile?.displayName ?? "Unknown";
        const timestamp = format(new Date(msg.createdAt), "MMM d, yyyy 'at' h:mm a");
        return `**${name}** — ${timestamp}\n${msg.content}`;
      })
      .join("\n\n---\n\n");

    navigator.clipboard.writeText(header + timeline);
    toast.success("Activity copied to clipboard");
  };

  const assignedAgents = agents?.filter((a: Agent) => assigneeIds.includes(a.id)) || [];

  // Project members — resolve agentId from profile
  const projectMemberIds = taskProject?.members?.map(
    (m: ProjectMember) =>
      m.profile?.agentId ??
      m.profile?.agent?.id ??
      (m as any).agentId ??
      (m as any).agent?.id ??
      m.id ??
      (m as any)._id,
  );
  const unassignedAgents =
    agents?.filter((a: Agent) => {
      if (assigneeIds.includes(a.id)) return false;
      if (projectMemberIds && !projectMemberIds.includes(a.id)) return false;
      if (a.setupStatus !== "active") return false;
      if (a.isOnVacation) return false;
      return true;
    }) || [];

  const assigneePickerItems: ProfilePickerItem[] = unassignedAgents.map((agent: Agent) => {
    const isOffline = agent.lastHeartbeat
      ? Date.now() - new Date(agent.lastHeartbeat).getTime() > HEARTBEAT_TIMEOUT_MS
      : true;
    return {
      id: agent.id,
      name: agent.name,
      subtitle: isOffline ? "Offline" : "Online",
      kind: "agent" as const,
      agentId: agent.id,
      isOnline: !isOffline,
      isOffline,
    };
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        fullScreen
        className="flex flex-col overflow-hidden shadow-2xl"
      >
        {/* ===== TOP BAR ===== */}
        <div className="shrink-0 px-3 py-2 sm:px-6 sm:py-3 border-b border-border flex flex-col gap-1">
          {/* Parent task breadcrumb */}
          {parentTask && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onOpenTask?.(parentTask.taskNumber ?? parentTask.id)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>
                {parentTask.taskNumber && `#${parentTask.taskNumber} `}
                {parentTask.title}
              </span>
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="flex-1 min-w-0 group/title min-w-[150px]">
              {isEditing ? (
                <ShadcnInput
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-lg font-semibold text-foreground bg-transparent border-0 border-b-2 border-gray-900 rounded-none px-0 py-0.5 shadow-none focus-visible:ring-0"
                  placeholder="Task title"
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <DialogTitle className="text-lg font-semibold text-foreground truncate">
                    {task.taskNumber && (
                      <span className="text-muted-foreground font-normal mr-1.5">
                        #{task.taskNumber}
                      </span>
                    )}
                    <span>{task.title}</span>
                  </DialogTitle>
                  <div className="opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0">
                    <CopyButton text={task.title} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Working agents indicator */}
              {workingAgents.length > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-warning-muted border border-warning/30 px-2.5 py-1">
                  <Zap className="w-3 h-3 text-warning" />
                  <div className="flex -space-x-1.5">
                    {workingAgents.slice(0, 3).map((agent: Agent) => (
                      <ProfileAvatar
                        key={agent.id}
                        agentId={agent.id}
                        size="xs"
                        className="ring-1 ring-white"
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-warning hidden sm:inline">
                    {workingAgents.length} working
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil />}
                  onClick={handleStartEdit}
                  title="Edit task"
                >
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              )}
              {isEditing && (
                <>
                  <Button variant="primary" size="sm" icon={<Check />} onClick={handleSaveEdit}>
                    <span className="hidden sm:inline">Save</span>
                  </Button>
                  <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={handleCancelEdit}>
                    <span className="hidden sm:inline">Discard</span>
                  </Button>
                </>
              )}
              {/* Prev/Next task navigation */}
              {(prevTask || nextTask) && (
                <div className="flex items-center border border-border rounded-lg overflow-hidden ml-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={goToPrev}
                    disabled={!prevTask}
                    title="Previous task (←)"
                    aria-label="Previous task"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="w-px h-5 bg-border" />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={goToNext}
                    disabled={!nextTask}
                    title="Next task (→)"
                    aria-label="Next task"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                title="Close"
                aria-label="Close task detail"
                className="ml-1"
              >
                <X className="w-4 h-4" />
                <span className="font-medium hidden sm:inline">Close</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ===== MOBILE/TABLET: Quick status bar ===== */}
        <div className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50 overflow-x-auto">
          <StatusPill status={task.status as TaskStatus} />
          {task.priority && <PrioritySelect value={task.priority as Priority} />}
          {taskProject && (
            <Badge variant="indigo" className="whitespace-nowrap">
              <FolderKanban className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[120px]">{taskProject.name}</span>
            </Badge>
          )}
          {task.dueDate && <DueDatePill dueDate={task.dueDate} isDone={task.status === "done"} />}
        </div>

        {/* ===== MOBILE TAB BAR ===== */}
        <div className="md:hidden shrink-0 flex border-b border-border bg-background">
          {(["description", "details", "deliverables", "activity"] as const).map((tab) => {
            const label =
              tab === "description"
                ? "Task"
                : tab === "details"
                  ? "Details"
                  : tab === "deliverables"
                    ? "Deliverables"
                    : "Activity";
            const count =
              tab === "activity"
                ? (messages?.length ?? 0)
                : tab === "deliverables"
                  ? (deliverables?.length ?? 0)
                  : 0;
            return (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 min-w-0 px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                  mobileTab === tab
                    ? "text-foreground border-b-2 border-gray-900"
                    : "text-muted-foreground"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1">
                  {label}
                  {count > 0 && (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* ===== 3-COLUMN BODY ===== */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* ===== COL 1: Description + Deliverables (50%) ===== */}
          <div
            className={`${mobileTab === "description" ? "flex" : "hidden"} md:flex w-full md:w-1/2 min-w-0 flex-col flex-1 md:flex-none min-h-0 overflow-hidden md:border-r border-border`}
          >
            {/* Description — always visible */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-3 py-3 sm:px-6 sm:py-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Description
                </h3>
                {isEditing ? (
                  <MarkdownEditor
                    value={editDescription}
                    onChange={setEditDescription}
                    rows={12}
                    placeholder="Task description (supports markdown)"
                  />
                ) : task.description ? (
                  <div className="relative group/desc">
                    <div className="absolute top-0 right-0 opacity-0 group-hover/desc:opacity-100 transition-opacity">
                      <CopyButton text={task.description} />
                    </div>
                    <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
                      <MarkdownWithMentions content={task.description} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted border border-dashed border-border px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground italic">No description provided</p>
                  </div>
                )}
              </div>

              {/* Deliverables section below description — hidden on mobile (has its own tab) */}
              <div className="hidden md:block border-t border-border px-3 py-3 sm:px-6 sm:py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Deliverables
                  </h3>
                  {(deliverables?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {deliverables?.length}
                    </span>
                  )}
                </div>
                <ErrorBoundary
                  fallback={({ resetErrorBoundary, error }) => (
                    <PanelErrorFallback
                      label="Deliverables"
                      error={error}
                      onRetry={resetErrorBoundary}
                    />
                  )}
                >
                  <TaskDeliverables taskId={resolvedTaskId} agents={agents || []} />
                </ErrorBoundary>
              </div>

              {/* Subtask deliverables — rolled up from child tasks */}
              {childTasks && childTasks.length > 0 && (
                <div className="hidden md:block border-t border-border px-3 py-3 sm:px-6 sm:py-4">
                  <ErrorBoundary
                    fallback={({ resetErrorBoundary, error }) => (
                      <PanelErrorFallback
                        label="Subtask Deliverables"
                        error={error}
                        onRetry={resetErrorBoundary}
                      />
                    )}
                  >
                    <ChildTaskDeliverables parentTaskId={resolvedTaskId} />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>

          {/* ===== MOBILE ONLY: Deliverables tab ===== */}
          <div
            className={`${mobileTab === "deliverables" ? "flex" : "hidden"} md:hidden w-full flex-col flex-1 min-h-0 overflow-hidden`}
          >
            <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4">
              <ErrorBoundary
                fallback={({ resetErrorBoundary, error }) => (
                  <PanelErrorFallback
                    label="Deliverables"
                    error={error}
                    onRetry={resetErrorBoundary}
                  />
                )}
              >
                <TaskDeliverables taskId={resolvedTaskId} agents={agents || []} />
              </ErrorBoundary>
              {childTasks && childTasks.length > 0 && (
                <div className="mt-4">
                  <ErrorBoundary
                    fallback={({ resetErrorBoundary, error }) => (
                      <PanelErrorFallback
                        label="Subtask Deliverables"
                        error={error}
                        onRetry={resetErrorBoundary}
                      />
                    )}
                  >
                    <ChildTaskDeliverables parentTaskId={resolvedTaskId} />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>

          {/* ===== COL 2: Task Details (20%) ===== */}
          <div
            className={`${mobileTab === "details" ? "flex" : "hidden"} md:flex w-full md:w-1/5 min-w-0 md:border-r border-border bg-muted/50 flex-col flex-1 md:flex-none min-h-0 overflow-hidden`}
          >
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Details
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* Status */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Status
                </label>
                <StatusPill
                  status={task.status as TaskStatus}
                  interactive={isEditing}
                  onChange={handleStatusChange}
                />
              </div>

              {/* Priority */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Flag className="w-3.5 h-3.5" />
                  Priority
                </label>
                <PrioritySelect
                  value={task.priority as Priority}
                  interactive={isEditing}
                  onChange={(p) => handlePriorityChange(p)}
                />
              </div>

              {/* Project */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <FolderKanban className="w-3.5 h-3.5" />
                  Project
                </label>
                {taskProject ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 max-w-full">
                    <FolderKanban className="w-3 h-3 shrink-0" />
                    <span className="truncate">{taskProject.name}</span>
                  </span>
                ) : (
                  <Select
                    defaultValue=""
                    onValueChange={async (value) => {
                      if (!value) return;
                      try {
                        await executeUpdateTask({ id: taskId, projectId: value });
                        toast.success("Project assigned");
                      } catch {
                        toast.error("Failed to assign project");
                      }
                    }}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="No project — select to assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {allProjects
                        ?.filter((p: Project) => p.status === "active")
                        .map((p: Project) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Created by */}
              {task.createdByProfile && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                    <User className="w-3.5 h-3.5" />
                    Created by
                  </label>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground max-w-full">
                    <ProfileAvatar profileId={task.createdByProfile.id} size="2xs" />
                    <span className="truncate">{task.createdByProfile.displayName}</span>
                  </div>
                </div>
              )}

              <div className="border-t border-border" />

              {/* Assignees */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <User className="w-3.5 h-3.5" />
                  Assignees
                </label>
                {assignedAgents.length > 0 ? (
                  <div className="space-y-2">
                    {assignedAgents.map((agent: Agent) => {
                      const agentIsOffline = agent.lastHeartbeat
                        ? Date.now() - new Date(agent.lastHeartbeat).getTime() >
                          HEARTBEAT_TIMEOUT_MS
                        : true;
                      return (
                        <div key={agent.id} className="flex items-center gap-2 group/assignee">
                          <div className="relative">
                            <ProfileAvatar
                              agentId={agent.id}
                              size="sm"
                              className={agentIsOffline ? "opacity-60 grayscale" : ""}
                            />
                            {agentIsOffline && (
                              <WifiOff className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 text-muted-foreground bg-background rounded-full p-0.5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground leading-tight truncate">
                              {agent.name}
                            </p>
                          </div>
                          {isEditing && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleRemoveAssignee(agent.id)}
                              className="opacity-0 group-hover/assignee:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
                              title="Remove assignee"
                              aria-label={`Remove assignee ${agent.name}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Unassigned</p>
                )}
                {isEditing && (
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      onClick={() => setShowAgentDropdown(true)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add assignee
                    </Button>
                    <ProfilePickerDialog
                      open={showAgentDropdown}
                      onOpenChange={setShowAgentDropdown}
                      title="Add assignee"
                      searchPlaceholder="Search agents..."
                      emptyMessage="No agents found"
                      items={assigneePickerItems}
                      onSelect={(item) => {
                        handleAddAssignee(item.id);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Due Date */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Due Date
                </label>
                {isEditing ? (
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => handleDueDateChange(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
                  />
                ) : task.dueDate ? (
                  <DueDatePill dueDate={task.dueDate} isDone={task.status === "done"} />
                ) : (
                  <span className="text-xs text-muted-foreground italic">Not set</span>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(task.tags || []).length > 0
                    ? (task.tags || []).map((tag: string, idx: number) => (
                        <span key={idx} className="inline-flex items-center gap-1 group/tag">
                          <Badge variant="gray" size="sm">
                            {tag}
                            {isEditing && (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleRemoveTag(tag)}
                                className="ml-0.5 text-muted-foreground hover:text-foreground"
                                aria-label={`Remove tag ${tag}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            )}
                          </Badge>
                        </span>
                      ))
                    : !isEditing && (
                        <span className="text-xs text-muted-foreground italic">No tags</span>
                      )}
                  {isEditing && (
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      onBlur={handleAddTag}
                      placeholder="+ Add"
                      className="px-2 py-0.5 text-xs w-16 border border-border rounded-full bg-background focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-muted-foreground"
                    />
                  )}
                </div>
              </div>

              {/* Blocked By */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  Blocked By
                </label>
                {task.blockedByTask ? (
                  <div className="flex items-center gap-2 group/blocked">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        onOpenTask?.(task.blockedByTask!.taskNumber ?? task.blockedByTask!.id)
                      }
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors flex-1 min-w-0"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          task.blockedByTask.status === "done"
                            ? "bg-success"
                            : task.blockedByTask.status === "in_progress"
                              ? "bg-blue-400"
                              : task.blockedByTask.status === "blocked"
                                ? "bg-destructive"
                                : "bg-gray-300"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground shrink-0">
                        #{task.blockedByTask.taskNumber}
                      </span>
                      <span className="text-xs text-foreground truncate">
                        {task.blockedByTask.title}
                      </span>
                    </Button>
                    {isEditing && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleSetBlockedBy(null)}
                        className="opacity-0 group-hover/blocked:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all shrink-0"
                        title="Clear dependency"
                        aria-label="Clear dependency"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">None</p>
                )}
                {isEditing && !task.blockedByTask && (
                  <div className="relative mt-2">
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      onClick={() => setShowBlockedByPicker(!showBlockedByPicker)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Set dependency
                    </Button>
                    {showBlockedByPicker && projectTasks && (
                      <div className="absolute left-0 top-full mt-1 w-full bg-background rounded-lg border border-border shadow-lg z-10 py-1 max-h-40 overflow-y-auto">
                        {projectTasks
                          .filter(
                            (t: TaskListItem) => t.id !== taskId && t.blockedByTaskId !== taskId,
                          )
                          .map((t: TaskListItem) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleSetBlockedBy(t.id)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                            >
                              <span className="text-xs text-muted-foreground shrink-0">
                                #{t.taskNumber}
                              </span>
                              <span className="text-xs truncate">{t.title}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Child Tasks */}
              {childTasks && childTasks.length > 0 && (
                <>
                  <div className="border-t border-border" />
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                      <GitBranch className="w-3.5 h-3.5" />
                      Child Tasks
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {childTasks.length}
                      </span>
                    </label>
                    <div className="space-y-1.5">
                      {childTasks.map((child: TaskListItem) => (
                        <button
                          key={child.id}
                          onClick={() => onOpenTask?.(child.taskNumber ?? child.id)}
                          className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted transition-colors group/child"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              child.status === "done"
                                ? "bg-success"
                                : child.status === "in_progress"
                                  ? "bg-blue-400"
                                  : child.status === "blocked"
                                    ? "bg-destructive"
                                    : "bg-gray-300"
                            }`}
                          />
                          <span className="text-xs text-muted-foreground shrink-0">
                            #{child.taskNumber}
                          </span>
                          <span
                            className={`text-xs truncate flex-1 ${
                              child.status === "done"
                                ? "text-muted-foreground line-through"
                                : "text-foreground"
                            }`}
                          >
                            {child.title}
                          </span>
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      type="button"
                      onClick={async () => {
                        try {
                          const result = await executeSaveAsTemplate({ taskId });
                          if (result.error) throw result.error;
                          toast.success("Template saved");
                        } catch {
                          toast.error("Failed to save template");
                        }
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5" />
                      Save as Template
                    </Button>
                  </div>
                </>
              )}

              <div className="border-t border-border" />

              {/* Work Summary */}
              {workSummary &&
                (workSummary.totalWorkTimeMs > 0 || workSummary.activeSessionCount > 0) && (
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Work Summary
                    </label>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Total time</span>
                        <span className="text-sm font-medium text-foreground">
                          {formatWorkTime(workSummary.totalWorkTimeMs)}
                        </span>
                      </div>
                      {workSummary.agentBreakdown?.map(
                        (entry: { agentId: string; agentName: string; totalMs: number }) => (
                          <div
                            key={entry.agentName ?? entry.agentId}
                            className="flex items-center gap-2"
                          >
                            <ProfileAvatar agentId={entry.agentId} size="2xs" />
                            <span className="text-xs text-muted-foreground flex-1 truncate">
                              {entry.agentName ?? "Unknown"}
                            </span>
                            <span className="text-xs font-medium text-foreground">
                              {formatWorkTime(entry.totalMs)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              <div className="border-t border-border" />

              {/* Timestamps */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <TimeAgo
                    date={
                      task.createdAt ??
                      (task as TaskDetail & { _creationTime?: string })._creationTime ??
                      ""
                    }
                    className="text-xs font-medium text-muted-foreground"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Updated</span>
                  <TimeAgo
                    date={task.updatedAt ?? ""}
                    className="text-xs font-medium text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ===== COL 3: Activity (30%) ===== */}
          <div
            className={`${mobileTab === "activity" ? "flex" : "hidden"} md:flex w-full md:w-[30%] min-h-0 flex-col bg-muted/30 flex-1 overflow-hidden`}
          >
            <div className="shrink-0 hidden md:flex px-4 py-3 border-b border-border items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Activity
              </h3>
              {(messages?.length ?? 0) > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {messages?.length}
                </span>
              )}
              {(messages?.length ?? 0) > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCopyActivity}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  title="Copy full activity timeline"
                  aria-label="Copy full activity timeline"
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ErrorBoundary
                fallback={({ resetErrorBoundary, error }) => (
                  <PanelErrorFallback label="Comments" error={error} onRetry={resetErrorBoundary} />
                )}
              >
                <TaskComments taskId={resolvedTaskId} />
              </ErrorBoundary>
            </div>
          </div>
        </div>

        {/* ===== REVIEW APPROVAL BAR ===== */}
        {task.status === "review" && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-t border-amber-200 bg-amber-50">
            <span className="text-xs font-semibold text-amber-700 mr-auto">Awaiting Review</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClarifyDialog(true)}
              disabled={approvalLoading !== null}
              className="text-violet-600 hover:text-violet-700 hover:bg-violet-50 border border-violet-200"
            >
              {approvalLoading === "clarify" ? (
                <span className="animate-spin">⟳</span>
              ) : (
                "? Clarify"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRejectDialog(true)}
              disabled={approvalLoading !== null}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200"
            >
              {approvalLoading === "reject" ? <span className="animate-spin">⟳</span> : "✕ Reject"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleApproveTask()}
              disabled={approvalLoading !== null}
            >
              {approvalLoading === "approve" ? (
                <span className="animate-spin">⟳</span>
              ) : (
                "✓ Approve"
              )}
            </Button>
          </div>
        )}

        {/* Reject Dialog */}
        {showRejectDialog && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowRejectDialog(false)}
          >
            <div
              className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-foreground">Reject Task</h2>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Rejection Reason *
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="Why is this being rejected?"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Changes Needed (one per line)
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="List changes needed, one per line"
                  value={rejectChanges}
                  onChange={(e) => setRejectChanges(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowRejectDialog(false);
                    setRejectReason("");
                    setRejectChanges("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRejectTask}
                  disabled={!rejectReason.trim()}
                >
                  Reject Task
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Clarify Dialog */}
        {showClarifyDialog && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowClarifyDialog(false)}
          >
            <div
              className="bg-background rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold text-foreground">Request Clarification</h2>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Questions (one per line)
                </label>
                <textarea
                  className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={4}
                  placeholder="What questions do you have? One question per line."
                  value={clarifyQuestions}
                  onChange={(e) => setClarifyQuestions(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowClarifyDialog(false);
                    setClarifyQuestions("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleClarifyTask}
                  disabled={!clarifyQuestions.trim()}
                >
                  Send Questions
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
