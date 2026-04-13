"use client";

import { useState, useMemo } from "react";
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
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import {
  X,
  Sparkles,
  Type,
  FileText,
  Calendar,
  Tag,
  Users,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Flag,
  Layers,
  Plus,
  Trash2,
  FolderKanban,
} from "lucide-react";
import { MarkdownEditor } from "../common/MarkdownEditor";
import { Button, PrioritySelect } from "../ui";
import { ProfileChipPicker } from "../ui/ProfileChipPicker";
import type { ProfilePickerItem } from "../ui/ProfilePickerDialog";
import { Input as ShadcnInput } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { useQuery, useMutation } from "urql";
import {
  AGENTS_QUERY,
  TASK_TEMPLATES_QUERY,
  PROJECTS_QUERY,
  PROJECT_QUERY,
} from "../../lib/graphql/queries";
import {
  CREATE_TASK_FROM_DASHBOARD,
  INSTANTIATE_TEMPLATE,
  DELETE_TASK_TEMPLATE,
  CREATE_TASK_TEMPLATE,
} from "../../lib/graphql/mutations";
import { useTaskNavigation } from "../../hooks/useTaskNavigation";
import { useCurrentProject } from "../context/AppContext";
import type { Agent, ProjectMember, TaskTemplate, Project } from "@agentcenter/types";
import {
  Priority,
  SetupStatus,
  ProjectStatus,
  ProfileKind,
  type PriorityValue,
} from "@/server/constants";

const blankFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  priority: z.enum(Object.values(Priority) as [PriorityValue, ...PriorityValue[]]),
  dueDate: z.string().optional(),
  selectedProjectId: z.string().nullable(),
  selectedAgentIds: z.array(z.string()),
  tags: z.array(z.string()),
});

type BlankFormValues = z.infer<typeof blankFormSchema>;

type TabId = "blank" | "template";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTaskModal({ isOpen, onClose }: CreateTaskModalProps) {
  const [, executeCreateTask] = useMutation(CREATE_TASK_FROM_DASHBOARD);
  const [agentsResult] = useQuery({ query: AGENTS_QUERY });
  const allAgents = agentsResult.data?.agents;
  const [templatesResult] = useQuery({ query: TASK_TEMPLATES_QUERY });
  const templates = templatesResult.data?.taskTemplates;
  const [, executeInstantiateTemplate] = useMutation(INSTANTIATE_TEMPLATE);
  const [, executeRemoveTemplate] = useMutation(DELETE_TASK_TEMPLATE);
  const [, executeCreateTemplate] = useMutation(CREATE_TASK_TEMPLATE);
  const openTask = useTaskNavigation();
  const { projectId: contextProjectId } = useCurrentProject();
  const [projectsResult] = useQuery({ query: PROJECTS_QUERY });
  const projects = projectsResult.data?.projects;

  // Blank tab form (zod + react-hook-form)
  const form = useForm<BlankFormValues>({
    resolver: zodResolver(blankFormSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: Priority.MEDIUM,
      dueDate: "",
      selectedProjectId: null,
      selectedAgentIds: [],
      tags: [],
    },
  });

  // Local project selection — defaults to header project, but user can change per-task
  const [projectInitialized, setProjectInitialized] = useState(false);

  // Sync local state when modal opens or context changes
  if (isOpen && !projectInitialized) {
    form.setValue("selectedProjectId", contextProjectId);
    setProjectInitialized(true);
  }
  if (!isOpen && projectInitialized) {
    setProjectInitialized(false);
  }

  const selectedProjectId = form.watch("selectedProjectId");

  const [selectedProjectResult] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: selectedProjectId },
    pause: !selectedProjectId,
  });
  const selectedProject = selectedProjectResult.data?.project;

  // Restrict agents to project members when a project is selected; only show active agents (exclude deactivated and pending_setup)
  const agents =
    (selectedProjectId && selectedProject?.members
      ? allAgents?.filter((a: Agent) =>
          selectedProject.members.some(
            (m: ProjectMember) => (m.profile?.agentId ?? m.profile?.agent?.id) === a.id,
          ),
        )
      : allAgents
    )?.filter((a: Agent) => a.setupStatus === SetupStatus.ACTIVE && !a.isOnVacation) ?? undefined;

  const agentPickerItems: ProfilePickerItem[] = useMemo(
    () =>
      (agents ?? []).map((agent: Agent) => ({
        id: agent.id,
        name: agent.name,
        subtitle: agent.role || undefined,
        kind: ProfileKind.AGENT,
        agentId: agent.id,
      })),
    [agents],
  );

  const [activeTab, setActiveTab] = useState<TabId>("blank");

  // Blank tab transient state (not form-managed)
  const [tagInput, setTagInput] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  // Template tab state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateTitleOverride, setTemplateTitleOverride] = useState("");
  const [templatePriority, setTemplatePriority] = useState<PriorityValue>(Priority.MEDIUM);
  const [templateAgentIds, setTemplateAgentIds] = useState<string[]>([]);
  const [templateTagInput, setTemplateTagInput] = useState("");
  const [templateTags, setTemplateTags] = useState<string[]>([]);
  const [templateDueDate, setTemplateDueDate] = useState("");
  const [showTemplateOptional, setShowTemplateOptional] = useState(false);
  const [isInstantiating, setIsInstantiating] = useState(false);

  // Create template form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newSubtasks, setNewSubtasks] = useState<
    { title: string; description: string; priority?: PriorityValue }[]
  >([{ title: "", description: "", priority: "medium" }]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const selectedTemplate =
    templates?.find((t: TaskTemplate) => t.id === selectedTemplateId) ?? null;

  // Parse subtasks if they come as JSON string from GraphQL
  const selectedTemplateSubtasks = selectedTemplate
    ? ((typeof selectedTemplate.subtasks === "string"
        ? JSON.parse(selectedTemplate.subtasks)
        : selectedTemplate.subtasks) ?? [])
    : [];

  const handleSubmit = async (data: BlankFormValues) => {
    try {
      const result = await executeCreateTask({
        title: data.title.trim(),
        description: data.description.trim(),
        priority: data.priority,
        assigneeIds: data.selectedAgentIds.length > 0 ? data.selectedAgentIds : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate).getTime().toString() : undefined,
        tags: data.tags.length > 0 ? data.tags : undefined,
        projectId: data.selectedProjectId ?? undefined,
      });

      if (result.error) throw result.error;

      toast.success("Task created");
      resetFields();
      onClose();
    } catch {
      toast.error("Failed to create task");
    }
  };

  const handleInstantiate = async () => {
    if (!selectedTemplateId || !selectedTemplate) return;

    setIsInstantiating(true);
    try {
      const result = await executeInstantiateTemplate({
        templateId: selectedTemplateId,
        titleOverride: templateTitleOverride.trim() || undefined,
        priority: templatePriority,
        assigneeIds: templateAgentIds.length > 0 ? templateAgentIds : undefined,
        dueDate: templateDueDate ? new Date(templateDueDate).getTime().toString() : undefined,
        tags: templateTags.length > 0 ? templateTags : undefined,
        projectId: selectedProjectId ?? undefined,
      });

      if (result.error) throw result.error;

      // The instantiateTemplate mutation returns JSON — parse if needed
      const instantiateResult =
        typeof result.data?.instantiateTemplate === "string"
          ? JSON.parse(result.data.instantiateTemplate)
          : result.data?.instantiateTemplate;

      const childTaskIds = instantiateResult?.childTaskIds ?? [];
      const count = 1 + childTaskIds.length;
      toast.success(`Created ${count} task${count > 1 ? "s" : ""} from template`);
      resetFields();
      onClose();
      if (instantiateResult?.parentTaskId) {
        openTask(instantiateResult.parentTaskId);
      }
    } catch {
      toast.error("Failed to create from template");
    } finally {
      setIsInstantiating(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await executeRemoveTemplate({ id: templateId });
      if (result.error) throw result.error;
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handleSaveNewTemplate = async () => {
    const validSubtasks = newSubtasks.filter((s) => s.title.trim() && s.description.trim());
    if (!newTemplateName.trim() || validSubtasks.length === 0) return;

    setIsSavingTemplate(true);
    try {
      const result = await executeCreateTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim() || undefined,
        subtasks: JSON.stringify(
          validSubtasks.map((s) => ({
            title: s.title.trim(),
            description: s.description.trim(),
            priority: s.priority,
          })),
        ),
      });
      if (result.error) throw result.error;
      toast.success("Template created");
      setShowCreateForm(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      setNewSubtasks([{ title: "", description: "", priority: "medium" }]);
    } catch {
      toast.error("Failed to create template");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const updateSubtask = (
    index: number,
    field: "title" | "description" | "priority",
    value: string,
  ) => {
    setNewSubtasks((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeSubtask = (index: number) => {
    setNewSubtasks((prev) => prev.filter((_, i) => i !== index));
  };

  const addSubtask = () => {
    setNewSubtasks((prev) => [...prev, { title: "", description: "", priority: "medium" }]);
  };

  const resetFields = () => {
    form.reset();
    setTagInput("");
    setShowOptional(false);
    setActiveTab("blank");
    setSelectedTemplateId(null);
    setTemplateTitleOverride("");
    setTemplatePriority("medium");
    setTemplateAgentIds([]);
    setTemplateTagInput("");
    setTemplateTags([]);
    setTemplateDueDate("");
    setShowTemplateOptional(false);
    setShowCreateForm(false);
    setNewTemplateName("");
    setNewTemplateDesc("");
    setNewSubtasks([{ title: "", description: "", priority: "medium" }]);
  };

  const handleClose = () => {
    if (!form.formState.isSubmitting && !isInstantiating) {
      resetFields();
      onClose();
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTagFromInput();
    }
  };

  const addTagFromInput = () => {
    const currentTags = form.getValues("tags");
    const newTags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !currentTags.includes(t));
    if (newTags.length > 0) {
      form.setValue("tags", [...currentTags, ...newTags]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const currentTags = form.getValues("tags");
    form.setValue(
      "tags",
      currentTags.filter((t) => t !== tag),
    );
  };

  const handleTemplateTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTemplateTag();
    }
  };

  const addTemplateTag = () => {
    const newTags = templateTagInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !templateTags.includes(t));
    if (newTags.length > 0) {
      setTemplateTags((prev) => [...prev, ...newTags]);
    }
    setTemplateTagInput("");
  };

  const removeTemplateTag = (tag: string) => {
    setTemplateTags((prev) => prev.filter((t) => t !== tag));
  };

  const selectTemplate = (template: TaskTemplate) => {
    setSelectedTemplateId(template.id);
    setTemplateTitleOverride(template.name);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="p-0 gap-0 w-full min-h-dvh sm:min-h-0 sm:max-w-xl overflow-y-auto sm:rounded-2xl bg-background shadow-2xl"
      >
        <div className="flex flex-col min-h-dvh sm:min-h-0">
          {/* Header */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-foreground">
                    New Task
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Kia will assign priority and delegate to the right agent.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={handleClose}
                aria-label="Close dialog"
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="mx-4 sm:mx-6 flex gap-1 bg-muted rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("blank")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "blank"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Blank
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("template")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === "template"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              From Template
            </button>
          </div>

          {/* Divider */}
          <div className="mx-4 sm:mx-6 mt-3 border-t border-border" />

          {/* ===== BLANK TAB ===== */}
          {activeTab === "blank" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col flex-1">
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
                          <ShadcnInput
                            type="text"
                            placeholder="e.g., Write blog post about AI automation"
                            className="w-full rounded-lg px-3.5 py-2.5"
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
                          rows={5}
                          placeholder="Describe what needs to be done... (supports markdown)"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Project */}
                  {projects && projects.length > 0 && (
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
                              {projects.map((p: Project) => (
                                <SelectItem
                                  key={p.id}
                                  value={p.id}
                                  disabled={p.status === ProjectStatus.ARCHIVED || p.shutdownActive}
                                >
                                  {p.name}
                                  {p.status === ProjectStatus.ARCHIVED
                                    ? " (Archived)"
                                    : p.shutdownActive
                                      ? " (Paused)"
                                      : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Section divider + optional toggle */}
                  <div className="border-t border-border pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowOptional(!showOptional)}
                      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-1"
                    >
                      {showOptional ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      Optional fields
                    </Button>
                  </div>

                  {showOptional && (
                    <div className="space-y-5">
                      {/* Priority */}
                      <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Priority</FormLabel>
                            <PrioritySelect
                              value={field.value}
                              interactive={true}
                              onChange={(p) => field.onChange(p as PriorityValue)}
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Assignees */}
                      {agents && agents.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            <Users className="w-3.5 h-3.5 text-muted-foreground" />
                            Assignees
                          </label>
                          <ProfileChipPicker
                            items={agentPickerItems}
                            selectedIds={form.watch("selectedAgentIds")}
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
                            dialogTitle="Select assignees"
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
                        {form.watch("tags").length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {form.watch("tags").map((tag) => (
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
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </span>
                            ))}
                          </div>
                        )}
                        <ShadcnInput
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleTagInputKeyDown}
                          onBlur={addTagFromInput}
                          placeholder="Type a tag and press Enter"
                        />
                      </div>

                      {/* Due Date */}
                      <FormField
                        control={form.control}
                        name="dueDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                              Due Date
                            </FormLabel>
                            <FormControl>
                              <ShadcnInput type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-muted border-t border-border flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Markdown supported</p>
                  <div className="flex items-center gap-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={handleClose}
                      disabled={form.formState.isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={form.formState.isSubmitting}
                      loading={form.formState.isSubmitting}
                    >
                      {form.formState.isSubmitting ? "Creating..." : "Create Task"}
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          )}

          {/* ===== FROM TEMPLATE TAB ===== */}
          {activeTab === "template" && (
            <div className="flex flex-col flex-1">
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
                {showCreateForm ? (
                  /* Create template form */
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowCreateForm(false)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      &larr; Back to templates
                    </Button>

                    {/* Template name */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Type className="w-3.5 h-3.5 text-muted-foreground" />
                        Template Name
                        <span className="text-destructive">*</span>
                      </label>
                      <ShadcnInput
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="e.g., Blog Post Pipeline"
                        autoFocus
                      />
                    </div>

                    {/* Template description */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        Description
                      </label>
                      <ShadcnInput
                        type="text"
                        value={newTemplateDesc}
                        onChange={(e) => setNewTemplateDesc(e.target.value)}
                        placeholder="Optional description"
                      />
                    </div>

                    {/* Subtasks builder */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                        Subtasks
                        <span className="text-destructive">*</span>
                      </label>
                      <div className="space-y-3">
                        {newSubtasks.map((subtask, idx) => (
                          <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground shrink-0">
                                #{idx + 1}
                              </span>
                              <ShadcnInput
                                type="text"
                                value={subtask.title}
                                onChange={(e) => updateSubtask(idx, "title", e.target.value)}
                                placeholder="Subtask title"
                                className="flex-1"
                              />
                              <Select
                                value={subtask.priority || Priority.MEDIUM}
                                onValueChange={(v) => updateSubtask(idx, "priority", v)}
                              >
                                <SelectTrigger className="w-24">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={Priority.LOW}>Low</SelectItem>
                                  <SelectItem value={Priority.MEDIUM}>Medium</SelectItem>
                                  <SelectItem value={Priority.HIGH}>High</SelectItem>
                                </SelectContent>
                              </Select>
                              {newSubtasks.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => removeSubtask(idx)}
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                            <ShadcnInput
                              type="text"
                              value={subtask.description}
                              onChange={(e) => updateSubtask(idx, "description", e.target.value)}
                              placeholder="Subtask description"
                            />
                          </div>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={addSubtask}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add subtask
                      </Button>
                    </div>
                  </>
                ) : !selectedTemplate ? (
                  /* Template list */
                  <>
                    {/* New Template button */}
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={() => setShowCreateForm(true)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:border-gray-400 hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      New Template
                    </Button>

                    {!templates || templates.length === 0 ? (
                      <div className="rounded-lg bg-muted border border-dashed border-border px-4 py-12 text-center">
                        <LayoutTemplate className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">
                          No templates yet
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Create one above, or save from an existing task with subtasks.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {templates.map((template: TaskTemplate) => {
                          const subtasks =
                            typeof template.subtasks === "string"
                              ? JSON.parse(template.subtasks)
                              : (template.subtasks ?? []);
                          return (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => selectTemplate(template)}
                              className="w-full text-left rounded-lg border border-border px-4 py-3 hover:border-border hover:bg-muted transition-colors group/template"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {template.name}
                                    </p>
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-xs text-muted-foreground shrink-0">
                                      <Layers className="w-3 h-3" />
                                      {subtasks.length}
                                    </span>
                                  </div>
                                  {template.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                      {template.description}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={(e) => handleDeleteTemplate(template.id, e)}
                                  className="opacity-0 group-hover/template:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive-muted transition-all shrink-0"
                                  title="Delete template"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* Template preview + config */
                  <>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedTemplateId(null)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                      >
                        &larr; Back to templates
                      </Button>

                      {/* Parent task title (editable) */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <Type className="w-3.5 h-3.5 text-muted-foreground" />
                          Parent Task Title
                        </label>
                        <ShadcnInput
                          type="text"
                          value={templateTitleOverride}
                          onChange={(e) => setTemplateTitleOverride(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Project */}
                    {projects && projects.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                          Project
                        </label>
                        <Select
                          value={selectedProjectId ?? "__none__"}
                          onValueChange={(v) =>
                            form.setValue("selectedProjectId", v === "__none__" ? null : v)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No Project" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No Project</SelectItem>
                            {projects.map((p: Project) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                disabled={p.status === ProjectStatus.ARCHIVED}
                              >
                                {p.name}
                                {p.status === ProjectStatus.ARCHIVED ? " (Archived)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Subtasks preview */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                        Subtasks
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {selectedTemplateSubtasks.length}
                        </span>
                      </label>
                      <div className="rounded-lg border border-border divide-y divide-border">
                        {selectedTemplateSubtasks.map(
                          (
                            subtask: { title: string; description?: string; priority?: string },
                            idx: number,
                          ) => (
                            <div key={idx} className="px-3 py-2 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                              <span className="text-sm text-foreground flex-1 truncate">
                                {subtask.title}
                              </span>
                              {subtask.priority && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                    subtask.priority === Priority.HIGH
                                      ? "bg-destructive-muted text-destructive"
                                      : subtask.priority === Priority.MEDIUM
                                        ? "bg-warning-muted text-warning"
                                        : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <Flag className="w-2.5 h-2.5" />
                                  {subtask.priority}
                                </span>
                              )}
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    {/* Optional fields for parent */}
                    <div className="border-t border-border pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setShowTemplateOptional(!showTemplateOptional)}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-1"
                      >
                        {showTemplateOptional ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        Optional fields
                      </Button>
                    </div>

                    {showTemplateOptional && (
                      <div className="space-y-5">
                        {/* Priority */}
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-foreground">Priority</label>
                          <PrioritySelect
                            value={templatePriority}
                            interactive={true}
                            onChange={(p) => setTemplatePriority(p as PriorityValue)}
                          />
                        </div>

                        {/* Assignees */}
                        {agents && agents.length > 0 && (
                          <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              Assignees
                            </label>
                            <ProfileChipPicker
                              items={agentPickerItems}
                              selectedIds={templateAgentIds}
                              onAdd={(ids) => setTemplateAgentIds((prev) => [...prev, ...ids])}
                              onRemove={(id) =>
                                setTemplateAgentIds((prev) => prev.filter((i) => i !== id))
                              }
                              dialogTitle="Select assignees"
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
                          {templateTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {templateTags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-muted text-foreground rounded-full"
                                >
                                  {tag}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => removeTemplateTag(tag)}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </span>
                              ))}
                            </div>
                          )}
                          <ShadcnInput
                            type="text"
                            value={templateTagInput}
                            onChange={(e) => setTemplateTagInput(e.target.value)}
                            onKeyDown={handleTemplateTagKeyDown}
                            onBlur={addTemplateTag}
                            placeholder="Type a tag and press Enter"
                          />
                        </div>

                        {/* Due Date */}
                        <div className="space-y-1.5">
                          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            Due Date
                          </label>
                          <ShadcnInput
                            type="date"
                            value={templateDueDate}
                            onChange={(e) => setTemplateDueDate(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 bg-muted border-t border-border flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {showCreateForm
                    ? `${newSubtasks.filter((s) => s.title.trim() && s.description.trim()).length} subtask${newSubtasks.filter((s) => s.title.trim() && s.description.trim()).length !== 1 ? "s" : ""} defined`
                    : selectedTemplate
                      ? `${selectedTemplateSubtasks.length} subtask${selectedTemplateSubtasks.length !== 1 ? "s" : ""} will be created`
                      : `${templates?.length ?? 0} template${(templates?.length ?? 0) !== 1 ? "s" : ""} available`}
                </p>
                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleClose}
                    disabled={isInstantiating || isSavingTemplate}
                  >
                    Cancel
                  </Button>
                  {showCreateForm && (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={
                        !newTemplateName.trim() ||
                        newSubtasks.filter((s) => s.title.trim() && s.description.trim()).length ===
                          0
                      }
                      loading={isSavingTemplate}
                      onClick={handleSaveNewTemplate}
                    >
                      {isSavingTemplate ? "Saving..." : "Save Template"}
                    </Button>
                  )}
                  {selectedTemplate && !showCreateForm && (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={!selectedTemplate}
                      loading={isInstantiating}
                      onClick={handleInstantiate}
                    >
                      {isInstantiating ? "Creating..." : "Create from Template"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
