"use client";

import { useState, useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/shadcn/form";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { toast } from "sonner";
import { useQuery, useMutation } from "urql";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  Plus,
  Repeat,
  Pause,
  Play,
  Trash2,
  Pencil,
  X,
  Type,
  FileText,
  Calendar,
  Tag,
  Users,
  Clock,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  Zap,
} from "lucide-react";
import {
  Breadcrumbs,
  Button,
  Badge,
  Card,
  ConfirmDialog,
  PrioritySelect,
  PageLayout,
  EmptyState,
  SkeletonList,
} from "../components/ui";
import { ProfileChipPicker } from "../components/ui/ProfileChipPicker";
import type { ProfilePickerItem } from "../components/ui/ProfilePickerDialog";
import { MarkdownEditor } from "../components/common/MarkdownEditor";
import { RECURRING_TASKS_QUERY } from "../lib/graphql/queries/recurring-tasks";
import {
  CREATE_RECURRING_TASK,
  UPDATE_RECURRING_TASK,
  PAUSE_RECURRING_TASK,
  RESUME_RECURRING_TASK,
  TRIGGER_RECURRING_TASK,
  DELETE_RECURRING_TASK,
} from "../lib/graphql/mutations/recurring-tasks";
import { AGENTS_QUERY, PROJECTS_QUERY } from "../lib/graphql/queries";
import { useCurrentProject } from "../components/context/AppContext";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface RecurrenceConfig {
  type: "daily" | "weekly" | "monthly";
  interval: number;
  time: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
}

interface RecurringTaskAssignee {
  profile?: {
    displayName?: string;
    agentId?: string;
  };
}

interface RecurringTask {
  id: string;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  isActive: boolean;
  nextDueAt?: string | null;
  recurrenceConfig: RecurrenceConfig;
  assignees?: RecurringTaskAssignee[];
  tags?: string[];
  projectId?: string;
}

interface AgentResult {
  id: string;
  name?: string;
  role?: string;
  setupStatus?: string;
  isOnVacation?: boolean;
}

interface ProjectResult {
  id: string;
  name: string;
}

function formatNextDue(dateStr: string | null | undefined): string {
  if (!dateStr) return "Not scheduled";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return "Overdue";
  if (diffHours < 1) return "Less than 1 hour";
  if (diffHours < 24) return `In ${diffHours} hour${diffHours !== 1 ? "s" : ""}`;
  if (diffDays < 7) return `In ${diffDays} day${diffDays !== 1 ? "s" : ""}`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function describeRecurrence(config: RecurrenceConfig | null | undefined): string {
  if (!config) return "Unknown";
  const time = config.time ?? "09:00";
  const interval = config.interval ?? 1;

  switch (config.type) {
    case "daily":
      return interval === 1 ? `Daily at ${time}` : `Every ${interval} days at ${time}`;
    case "weekly": {
      const days = config.daysOfWeek as number[] | undefined;
      if (days && days.length > 0) {
        const dayNames = days.map((d: number) => DAYS_OF_WEEK[d]?.label).join(", ");
        return interval === 1
          ? `Weekly on ${dayNames} at ${time}`
          : `Every ${interval} weeks on ${dayNames} at ${time}`;
      }
      return interval === 1 ? `Weekly at ${time}` : `Every ${interval} weeks at ${time}`;
    }
    case "monthly": {
      const day = config.dayOfMonth;
      const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
      return day
        ? interval === 1
          ? `Monthly on the ${day}${suffix} at ${time}`
          : `Every ${interval} months on the ${day}${suffix} at ${time}`
        : interval === 1
          ? `Monthly at ${time}`
          : `Every ${interval} months at ${time}`;
    }
    default:
      return "Unknown schedule";
  }
}

export function RecurringTasksPage() {
  const { projectId } = useCurrentProject();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [result, reexecute] = useQuery({
    query: RECURRING_TASKS_QUERY,
    variables: { projectId, includeInactive: true },
  });

  const [, executePause] = useMutation(PAUSE_RECURRING_TASK);
  const [, executeResume] = useMutation(RESUME_RECURRING_TASK);
  const [, executeTrigger] = useMutation(TRIGGER_RECURRING_TASK);
  const [, executeDelete] = useMutation(DELETE_RECURRING_TASK);

  const recurringTasks = [...(result.data?.recurringTasks ?? [])].sort(
    (a: RecurringTask, b: RecurringTask) => {
      // Active first, paused last
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return 0;
    },
  );
  const isLoading = result.fetching;

  const handlePause = useCallback(
    async (id: string) => {
      const res = await executePause({ id });
      if (res.error) {
        toast.error("Failed to pause");
      } else {
        toast.success("Recurring task paused");
        reexecute({ requestPolicy: "network-only" });
      }
    },
    [executePause, reexecute],
  );

  const handleResume = useCallback(
    async (id: string) => {
      const res = await executeResume({ id });
      if (res.error) {
        toast.error("Failed to resume");
      } else {
        toast.success("Recurring task resumed");
        reexecute({ requestPolicy: "network-only" });
      }
    },
    [executeResume, reexecute],
  );

  const handleTrigger = useCallback(
    async (id: string) => {
      const res = await executeTrigger({ id });
      if (res.error) {
        toast.error("Failed to generate task");
      } else {
        toast.success("Task created from blueprint");
        reexecute({ requestPolicy: "network-only" });
      }
    },
    [executeTrigger, reexecute],
  );

  const handleDelete = useCallback((id: string) => {
    setDeleteConfirmId(id);
  }, []);

  const confirmDeleteTask = useCallback(async () => {
    if (!deleteConfirmId) return;
    const res = await executeDelete({ id: deleteConfirmId });
    if (res.error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Recurring task deleted");
      reexecute({ requestPolicy: "network-only" });
    }
    setDeleteConfirmId(null);
  }, [deleteConfirmId, executeDelete, reexecute]);

  const handleEdit = useCallback((id: string) => {
    setEditingId(id);
    setIsModalOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditingId(null);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setEditingId(null);
    reexecute({ requestPolicy: "network-only" });
  }, [reexecute]);

  return (
    <PageLayout>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Recurring Tasks" }]} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
            <Repeat className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Recurring Tasks</h1>
            <p className="text-sm text-muted-foreground">
              Blueprints that auto-generate tasks on a schedule
            </p>
          </div>
        </div>
        <Button variant="primary" size="lg" onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="w-5 h-5 mr-1.5" />
          New Recurring Task
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <SkeletonList count={3} height="h-24" variant="card" />
      ) : recurringTasks.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="No recurring tasks yet"
          description="Create one to auto-generate tasks on a schedule."
          action={
            <Button variant="primary" size="lg" onClick={handleCreate} icon={<Plus />}>
              Create Recurring Task
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {recurringTasks.map((rt: RecurringTask) => (
            <Card
              key={rt.id}
              className={`px-4 sm:px-5 py-4 hover:border-border transition-colors ${
                !rt.isActive ? "opacity-60" : ""
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground truncate">{rt.title}</h3>
                    {!rt.isActive && <Badge variant="gray">Paused</Badge>}
                    {rt.priority && (
                      <Badge
                        variant={
                          rt.priority === "urgent"
                            ? "red"
                            : rt.priority === "high"
                              ? "orange"
                              : rt.priority === "medium"
                                ? "yellow"
                                : "gray"
                        }
                      >
                        {rt.priority}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-1 mb-2">
                    {rt.description}
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 shrink-0" />
                      {describeRecurrence(rt.recurrenceConfig)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      Next: {formatNextDue(rt.nextDueAt)}
                    </span>
                    {(rt.assignees?.length ?? 0) > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        {rt
                          .assignees!.map((a: RecurringTaskAssignee) => a.profile?.displayName)
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </div>
                  {(rt.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {rt.tags!.map((tag: string) => (
                        <Badge key={tag} variant="gray">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                  {rt.isActive && rt.nextDueAt && new Date(rt.nextDueAt) < new Date() && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleTrigger(rt.id)}
                      className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                      title="Generate task now"
                      aria-label="Generate task now"
                    >
                      <Zap className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(rt.id)}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  {rt.isActive ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePause(rt.id)}
                      className="text-muted-foreground hover:text-warning hover:bg-warning-muted"
                      title="Pause"
                      aria-label="Pause"
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleResume(rt.id)}
                      className="text-success hover:text-success hover:bg-success-muted"
                      title="Resume"
                      aria-label="Resume"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(rt.id)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <RecurringTaskModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        editingId={editingId}
        existingTasks={recurringTasks}
      />

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDeleteTask}
        title="Delete recurring task?"
        description="Generated tasks will not be affected."
        confirmLabel="Delete"
        variant="danger"
      />
    </PageLayout>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────

interface RecurringTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: string | null;
  existingTasks: RecurringTask[];
}

const recurringTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  recurrenceType: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().min(1),
  daysOfWeek: z.array(z.number()),
  dayOfMonth: z.number().min(1).max(31),
  time: z.string(),
  selectedAgentIds: z.array(z.string()),
  tags: z.array(z.string()),
  selectedProjectId: z.string().nullable(),
});

type RecurringTaskValues = z.infer<typeof recurringTaskSchema>;

function RecurringTaskModal({
  isOpen,
  onClose,
  editingId,
  existingTasks,
}: RecurringTaskModalProps) {
  const { projectId: contextProjectId } = useCurrentProject();
  const [agentsResult] = useQuery({ query: AGENTS_QUERY });
  const agents =
    agentsResult.data?.agents?.filter(
      (a: AgentResult) => a.setupStatus === "active" && !a.isOnVacation,
    ) ?? [];
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects ?? [];

  const [, executeCreate] = useMutation(CREATE_RECURRING_TASK);
  const [, executeUpdate] = useMutation(UPDATE_RECURRING_TASK);

  const editing = editingId ? existingTasks.find((t: RecurringTask) => t.id === editingId) : null;

  const form = useForm<RecurringTaskValues>({
    resolver: zodResolver(recurringTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      recurrenceType: "daily",
      interval: 1,
      daysOfWeek: [1, 2, 3, 4, 5],
      dayOfMonth: 1,
      time: "09:00",
      selectedAgentIds: [],
      tags: [],
      selectedProjectId: null,
    },
  });

  const [tagInput, setTagInput] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editing) {
        const config = editing.recurrenceConfig;
        form.reset({
          title: editing.title,
          description: editing.description,
          priority: editing.priority ?? "medium",
          recurrenceType: config?.type ?? "daily",
          interval: config?.interval ?? 1,
          daysOfWeek: config?.daysOfWeek ?? [1, 2, 3, 4, 5],
          dayOfMonth: config?.dayOfMonth ?? 1,
          time: config?.time ?? "09:00",
          selectedAgentIds:
            editing.assignees
              ?.map((a: RecurringTaskAssignee) => a.profile?.agentId)
              .filter((id): id is string => !!id) ?? [],
          tags: editing.tags ?? [],
          selectedProjectId: editing.projectId ?? contextProjectId,
        });
        setShowOptional(true);
      } else {
        form.reset({
          title: "",
          description: "",
          priority: "medium",
          recurrenceType: "daily",
          interval: 1,
          daysOfWeek: [1, 2, 3, 4, 5],
          dayOfMonth: 1,
          time: "09:00",
          selectedAgentIds: [],
          tags: [],
          selectedProjectId: contextProjectId,
        });
        setShowOptional(false);
      }
      setTagInput("");
    }
  }, [isOpen, editing]);

  const recurrenceType = form.watch("recurrenceType");
  const interval = form.watch("interval");
  const daysOfWeek = form.watch("daysOfWeek");
  const dayOfMonth = form.watch("dayOfMonth");
  const time = form.watch("time");
  const tags = form.watch("tags");
  const selectedAgentIds = form.watch("selectedAgentIds");

  const priority = form.watch("priority");
  const { isSubmitting } = form.formState;

  const buildConfig = () => {
    const config: RecurrenceConfig = { type: recurrenceType, interval, time };
    if (recurrenceType === "weekly" && daysOfWeek.length > 0) {
      config.daysOfWeek = daysOfWeek;
    }
    if (recurrenceType === "monthly") {
      config.dayOfMonth = dayOfMonth;
    }
    return config;
  };

  const onSubmit = async (data: RecurringTaskValues) => {
    try {
      const config = buildConfig();

      if (editing) {
        const res = await executeUpdate({
          id: editing.id,
          title: data.title.trim(),
          description: data.description.trim(),
          recurrenceConfig: JSON.stringify(config),
          priority: data.priority,
          tags: data.tags.length > 0 ? data.tags : [],
          assigneeIds: data.selectedAgentIds.length > 0 ? data.selectedAgentIds : [],
          projectId: data.selectedProjectId,
        });
        if (res.error) throw res.error;
        toast.success("Recurring task updated");
      } else {
        const res = await executeCreate({
          title: data.title.trim(),
          description: data.description.trim(),
          recurrenceConfig: JSON.stringify(config),
          priority: data.priority,
          tags: data.tags.length > 0 ? data.tags : [],
          assigneeIds: data.selectedAgentIds.length > 0 ? data.selectedAgentIds : [],
          projectId: data.selectedProjectId,
        });
        if (res.error) throw res.error;
        toast.success("Recurring task created");
      }
      onClose();
    } catch {
      toast.error(editing ? "Failed to update" : "Failed to create");
    }
  };

  const agentPickerItems: ProfilePickerItem[] = agents.map((a: AgentResult) => ({
    id: a.id,
    name: a.name || a.id,
    subtitle: a.role || "Agent",
    kind: "agent" as const,
    agentId: a.id,
  }));

  const toggleDay = (day: number) => {
    const current = form.getValues("daysOfWeek");
    form.setValue(
      "daysOfWeek",
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const currentTags = form.getValues("tags");
    const newTags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !currentTags.includes(t));
    if (newTags.length > 0) form.setValue("tags", [...currentTags, ...newTags]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const currentTags = form.getValues("tags");
    form.setValue(
      "tags",
      currentTags.filter((t) => t !== tag),
    );
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-xl p-0 gap-0 sm:rounded-2xl max-h-dvh sm:max-h-[85vh]"
        showCloseButton={false}
      >
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col min-h-dvh sm:min-h-0"
          >
            {/* Header */}
            <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
                    <Repeat className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-semibold text-foreground">
                      {editing ? "Edit Recurring Task" : "New Recurring Task"}
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {editing
                        ? "Changes apply to future generated tasks only"
                        : "Define a blueprint that generates tasks on a schedule"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="mx-4 sm:mx-6 border-t border-border" />

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Type className="w-3.5 h-3.5 text-muted-foreground" />
                      Title
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="e.g., Daily standup summary"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      Description
                    </FormLabel>
                    <MarkdownEditor
                      value={field.value}
                      onChange={field.onChange}
                      rows={4}
                      placeholder="Describe what needs to be done each time..."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Schedule section */}
              <div className="space-y-3">
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  Schedule
                </label>

                {/* Recurrence type */}
                <div className="flex gap-1 bg-muted rounded-lg p-0.5">
                  {(["daily", "weekly", "monthly"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => form.setValue("recurrenceType", type)}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        recurrenceType === type
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Interval */}
                <FormField
                  control={form.control}
                  name="interval"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Every</span>
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={field.value}
                        onChange={(e) => field.onChange(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 text-center"
                      />
                      <span className="text-sm text-muted-foreground">
                        {recurrenceType === "daily"
                          ? interval === 1
                            ? "day"
                            : "days"
                          : recurrenceType === "weekly"
                            ? interval === 1
                              ? "week"
                              : "weeks"
                            : interval === 1
                              ? "month"
                              : "months"}
                      </span>
                    </div>
                  )}
                />

                {/* Days of week (weekly only) */}
                {recurrenceType === "weekly" && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">On these days:</span>
                    <div className="flex gap-1">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            daysOfWeek.includes(day.value)
                              ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
                              : "bg-muted text-muted-foreground border border-border hover:border-border"
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day of month (monthly only) */}
                {recurrenceType === "monthly" && (
                  <FormField
                    control={form.control}
                    name="dayOfMonth"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">On day</span>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))
                          }
                          className="w-16 text-center"
                        />
                        <span className="text-sm text-muted-foreground">of the month</span>
                      </div>
                    )}
                  />
                )}

                {/* Time */}
                <FormField
                  control={form.control}
                  name="time"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">At</span>
                      <FormControl>
                        <Input type="time" {...field} className="w-auto" />
                      </FormControl>
                    </div>
                  )}
                />
              </div>

              {/* Project */}
              {projects.length > 0 && (
                <FormField
                  control={form.control}
                  name="selectedProjectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                        Project
                      </FormLabel>
                      <Select
                        value={field.value ?? "__none__"}
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No Project" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">No Project</SelectItem>
                          {projects.map((p: ProjectResult) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Optional fields toggle */}
              <div className="border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => setShowOptional(!showOptional)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-1"
                >
                  {showOptional ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Optional fields
                </button>
              </div>

              {showOptional && (
                <div className="space-y-5">
                  {/* Priority */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Priority</label>
                    <PrioritySelect
                      value={priority}
                      interactive={true}
                      onChange={(p) => form.setValue("priority", p)}
                    />
                  </div>

                  {/* Assignees */}
                  {agents.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        Assignees
                        {selectedAgentIds.length > 0 && (
                          <span className="text-muted-foreground font-normal">
                            ({selectedAgentIds.length})
                          </span>
                        )}
                      </label>
                      <ProfileChipPicker
                        items={agentPickerItems}
                        selectedIds={selectedAgentIds}
                        onAdd={(ids) => {
                          const current = form.getValues("selectedAgentIds");
                          form.setValue("selectedAgentIds", [...current, ...ids]);
                        }}
                        onRemove={(id) => {
                          const current = form.getValues("selectedAgentIds");
                          form.setValue(
                            "selectedAgentIds",
                            current.filter((i) => i !== id),
                          );
                        }}
                        label="Add assignees"
                        dialogTitle="Add assignees"
                        doneLabel="Add assignees"
                        searchPlaceholder="Search agents..."
                        emptyMessage="No agents available"
                      />
                    </div>
                  )}

                  {/* Tags */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                      Tags
                    </label>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted text-foreground rounded-full"
                          >
                            {tag}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => removeTag(tag)}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={`Remove tag ${tag}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </span>
                        ))}
                      </div>
                    )}
                    <Input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={addTag}
                      placeholder="Type a tag and press Enter"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-muted border-t border-border flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{describeRecurrence(buildConfig())}</p>
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={!form.formState.isValid}
                  loading={isSubmitting}
                >
                  {isSubmitting
                    ? editing
                      ? "Updating..."
                      : "Creating..."
                    : editing
                      ? "Update"
                      : "Create"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
