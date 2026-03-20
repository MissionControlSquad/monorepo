"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/shadcn/dialog";
import { toast } from "sonner";
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
import { useQuery, useMutation } from "urql";
import {
  PROJECT_QUERY,
  PROJECT_DOCS_BY_PROJECT_QUERY,
  PROJECT_DOC_QUERY,
  PROJECT_DOC_REVISIONS_QUERY,
  PROJECT_DOC_REVISION_QUERY,
  PROFILES_QUERY,
} from "../lib/graphql/queries";
import {
  UPDATE_PROJECT,
  ARCHIVE_PROJECT,
  RESTORE_PROJECT,
  ADD_PROJECT_MEMBER,
  REMOVE_PROJECT_MEMBER,
  CREATE_PROJECT_DOC,
  UPDATE_PROJECT_DOC,
  DELETE_PROJECT_DOC,
  SET_PROJECT_SHUTDOWN,
} from "../lib/graphql/mutations";
import {
  Users,
  Archive,
  Pencil,
  Check,
  X,
  FileText,
  ChevronDown,
  ChevronRight,
  Trash2,
  History,
  Loader2,
  RotateCcw,
  Plus,
  ShieldOff,
  Power,
  AlertTriangle,
} from "lucide-react";
import { ProjectMemberEditor } from "../components/project/ProjectMemberEditor";
import {
  Breadcrumbs,
  Button,
  Badge,
  Card,
  ConfirmDialog,
  Skeleton,
  SkeletonList,
} from "../components/ui";
import { ProfileAvatar } from "../components/ui/ProfileAvatar";
import { MarkdownEditor } from "../components/common/MarkdownEditor";
import { MarkdownWithMentions } from "../components/common/MarkdownWithMentions";
import { TimeAgo } from "../components/common/TimeAgo";
import { ErrorBoundary, PanelErrorFallback } from "../components/common/ErrorBoundary";
import { WhenFeatureEnabled } from "../components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";

// ─── Profile Result ──────────────────────────────────────────────────────────

interface ProfileResult {
  id: string;
  kind?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  agent?: { id: string; role?: string };
}

// ─── Doc Dialog ──────────────────────────────────────────────────────────────

interface DocDialogState {
  mode: "create" | "edit";
  docId?: string;
  title: string;
  summary: string;
  content: string;
}

const projectDocSchema = z.object({
  title: z.string().min(1, "Title is required"),
  summary: z.string().optional(),
  content: z.string().min(1, "Content is required"),
});

type ProjectDocValues = z.infer<typeof projectDocSchema>;

function ProjectDocDialog({
  isOpen,
  state,
  onClose,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  state: DocDialogState;
  onClose: () => void;
  onSave: (data: { title: string; summary: string; content: string }) => void;
  isSaving: boolean;
}) {
  const form = useForm<ProjectDocValues>({
    resolver: zodResolver(projectDocSchema),
    defaultValues: { title: "", summary: "", content: "" },
  });

  // Sync form when dialog opens or state changes
  useEffect(() => {
    if (isOpen) {
      form.reset({ title: state.title, summary: state.summary, content: state.content });
    }
  }, [isOpen, state, form]);

  const handleSubmit = (values: ProjectDocValues) => {
    onSave({
      title: values.title.trim(),
      summary: values.summary?.trim() ?? "",
      content: values.content.trim(),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl sm:max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <DialogTitle className="text-base font-semibold text-foreground">
              {state.mode === "create" ? "New Document" : "Edit Document"}
            </DialogTitle>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Body */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            id="doc-form"
            className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Title</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Document title" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    Summary <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Brief 1-2 sentence summary" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">Content</FormLabel>
                  <MarkdownEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Markdown content... (@ to mention)"
                    rows={12}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={isSaving ? <Loader2 className="animate-spin" /> : <Check />}
            type="submit"
            form="doc-form"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : state.mode === "create" ? "Create" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Detail Page ─────────────────────────────────────────────────────

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const [selectedProjectResult, reexecuteSelectedProject] = useQuery({
    query: PROJECT_QUERY,
    variables: { id: projectId },
  });
  const selectedProject = selectedProjectResult.data?.project;

  return (
    <div className="@container flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 @xl:px-6 @4xl:px-8 py-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Projects", href: "/projects" },
            { label: selectedProject?.name ?? "..." },
          ]}
        />

        <ErrorBoundary
          fallback={({ resetErrorBoundary, error }) => (
            <PanelErrorFallback label="Project" error={error} onRetry={resetErrorBoundary} />
          )}
        >
          {!selectedProject ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          ) : (
            <ProjectDetailPanel
              project={selectedProject}
              reexecuteProject={reexecuteSelectedProject}
            />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

// ─── Project Docs Section ────────────────────────────────────────────────────

function ProjectDocsSection({ projectId, readOnly }: { projectId: string; readOnly?: boolean }) {
  const [docsResult, reexecuteDocs] = useQuery({
    query: PROJECT_DOCS_BY_PROJECT_QUERY,
    variables: { projectId },
  });
  const docs = docsResult.data?.projectDocsByProject;

  const [, executeCreateDoc] = useMutation(CREATE_PROJECT_DOC);
  const [, executeUpdateDoc] = useMutation(UPDATE_PROJECT_DOC);
  const [, executeRemoveDoc] = useMutation(DELETE_PROJECT_DOC);

  const [isSaving, setIsSaving] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogState, setEditDialogState] = useState<DocDialogState>({
    mode: "create",
    title: "",
    summary: "",
    content: "",
  });

  // View dialog state
  const [viewDocId, setViewDocId] = useState<string | null>(null);

  const openCreate = () => {
    setEditDialogState({ mode: "create", title: "", summary: "", content: "" });
    setEditDialogOpen(true);
  };

  const openEdit = (doc: { id: string; title: string; summary?: string; content: string }) => {
    setViewDocId(null); // close view dialog
    setEditDialogState({
      mode: "edit",
      docId: doc.id,
      title: doc.title,
      summary: doc.summary ?? "",
      content: doc.content,
    });
    setEditDialogOpen(true);
  };

  const handleSave = async (data: { title: string; summary: string; content: string }) => {
    setIsSaving(true);
    try {
      if (editDialogState.mode === "create") {
        await executeCreateDoc({
          projectId,
          title: data.title,
          content: data.content,
          summary: data.summary || undefined,
        });
        toast.success("Doc created");
      } else {
        await executeUpdateDoc({
          id: editDialogState.docId,
          title: data.title,
          content: data.content,
          summary: data.summary || undefined,
        });
        toast.success("Doc updated");
      }
      setEditDialogOpen(false);
      reexecuteDocs({ requestPolicy: "network-only" });
    } catch {
      toast.error(
        editDialogState.mode === "create" ? "Failed to create doc" : "Failed to update doc",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await executeRemoveDoc({ id });
      if (viewDocId === id) setViewDocId(null);
      toast.success("Doc deleted");
      reexecuteDocs({ requestPolicy: "network-only" });
    } catch {
      toast.error("Failed to delete doc");
    }
  };

  return (
    <>
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Project Docs</h3>
          {!readOnly && (
            <Button variant="ghost" size="sm" icon={<Plus />} onClick={openCreate}>
              Add
            </Button>
          )}
        </div>

        {!docs ? (
          <SkeletonList count={2} height="h-12" />
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No docs yet. Add project briefs, guidelines, or links.
          </p>
        ) : (
          <div className="space-y-1">
            {docs.map((doc: { id: string; title: string; summary?: string; updatedAt: number }) => (
              <DocRow key={doc.id} doc={doc} onClick={() => setViewDocId(doc.id)} />
            ))}
          </div>
        )}
      </Card>

      {/* View Dialog */}
      <DocViewDialog
        docId={viewDocId}
        isOpen={!!viewDocId}
        onClose={() => setViewDocId(null)}
        onEdit={openEdit}
        onDelete={(id) => handleDelete(id)}
        readOnly={readOnly}
      />

      {/* Create/Edit Dialog */}
      <ProjectDocDialog
        isOpen={editDialogOpen}
        state={editDialogState}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </>
  );
}

// ─── Doc Row (simple clickable row) ──────────────────────────────────────────

function DocRow({
  doc,
  onClick,
}: {
  doc: { id: string; title: string; summary?: string; updatedAt: number };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted rounded-lg transition-colors border border-border group"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted group-hover:bg-blue-50 transition-colors shrink-0">
        <FileText className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-800">{doc.title}</span>
        {doc.summary && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.summary}</p>
        )}
      </div>
      <TimeAgo date={doc.updatedAt} className="text-[11px] text-gray-300 shrink-0" />
    </button>
  );
}

// ─── Doc View Dialog ─────────────────────────────────────────────────────────

function DocViewDialog({
  docId,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  readOnly,
}: {
  docId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (doc: { id: string; title: string; summary?: string; content: string }) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}) {
  const [fullDocResult] = useQuery({
    query: PROJECT_DOC_QUERY,
    variables: { id: docId! },
    pause: !docId,
  });
  const fullDoc = fullDocResult.data?.projectDoc;

  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setShowHistory(false);
      setConfirmDelete(false);
    }
  }, [isOpen]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-w-2xl sm:max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col"
          showCloseButton={false}
        >
          {!fullDoc ? (
            <div className="p-6 space-y-3">
              <DialogTitle className="sr-only">Loading document</DialogTitle>
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-border">
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base font-semibold text-foreground">
                    {fullDoc.title}
                  </DialogTitle>
                  {fullDoc.summary && (
                    <p className="text-sm text-muted-foreground mt-0.5">{fullDoc.summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {fullDoc.addedBy && (
                      <span>
                        by{" "}
                        {fullDoc.addedBy.identityEmoji ? `${fullDoc.addedBy.identityEmoji} ` : ""}
                        {fullDoc.addedBy.name}
                      </span>
                    )}
                    <TimeAgo date={fullDoc.updatedAt} />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors ml-3 shrink-0"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="text-sm text-foreground prose prose-sm max-w-none">
                  <MarkdownWithMentions content={fullDoc.content} />
                </div>

                {showHistory && docId && (
                  <div className="mt-5 pt-4 border-t border-border">
                    <RevisionHistory docId={docId} />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/50 rounded-b-xl">
                <div className="flex items-center gap-1">
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil />}
                      onClick={() =>
                        onEdit({
                          id: fullDoc.id,
                          title: fullDoc.title,
                          summary: fullDoc.summary,
                          content: fullDoc.content,
                        })
                      }
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<History />}
                    onClick={() => setShowHistory(!showHistory)}
                  >
                    {showHistory ? "Hide History" : "History"}
                  </Button>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 />}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (docId) onDelete(docId);
          setConfirmDelete(false);
        }}
        title="Delete this doc?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  );
}

// ─── Revision History ────────────────────────────────────────────────────────

function RevisionHistory({ docId }: { docId: string }) {
  const [revisionsResult] = useQuery({
    query: PROJECT_DOC_REVISIONS_QUERY,
    variables: { docId },
  });
  const revisions = revisionsResult.data?.projectDocRevisions;

  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  if (!revisions) {
    return <Skeleton className="mt-3 h-16" />;
  }

  if (revisions.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">No revision history.</p>;
  }

  return (
    <div className="mt-3 border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">Revision History</span>
      </div>
      <div className="divide-y divide-border">
        {revisions.map(
          (rev: {
            id: string;
            editAction: "created" | "updated" | "deleted";
            editedById?: string;
            editedBy?: { id: string; name: string; identityEmoji?: string };
            createdAt: number;
          }) => (
            <RevisionRow
              key={rev.id}
              revision={rev}
              isExpanded={expandedRevisionId === rev.id}
              onToggle={() => setExpandedRevisionId(expandedRevisionId === rev.id ? null : rev.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function RevisionRow({
  revision,
  isExpanded,
  onToggle,
}: {
  revision: {
    id: string;
    editAction: "created" | "updated" | "deleted";
    editedById?: string;
    editedBy?: { id: string; name: string; identityEmoji?: string };
    createdAt: number;
  };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [fullRevisionResult] = useQuery({
    query: PROJECT_DOC_REVISION_QUERY,
    variables: { id: revision.id },
    pause: !isExpanded,
  });
  const fullRevision = fullRevisionResult.data?.projectDocRevision;

  const actionLabel =
    revision.editAction === "created"
      ? "Created"
      : revision.editAction === "deleted"
        ? "Deleted"
        : "Updated";

  const byLabel = revision.editedBy?.name ? `by ${revision.editedBy.name}` : "from dashboard";

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-gray-300 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
        )}
        <span className="text-xs text-muted-foreground">
          {actionLabel} {byLabel}
        </span>
        <TimeAgo
          date={revision.createdAt}
          className="text-xs text-muted-foreground ml-auto shrink-0"
        />
      </button>
      {isExpanded && (
        <div className="px-3 pb-2">
          {!fullRevision ? (
            <Skeleton className="h-16" />
          ) : (
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted rounded p-2 max-h-48 overflow-y-auto">
              {fullRevision.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Project Detail Panel ────────────────────────────────────────────────────

function ProjectDetailPanel({
  project,
  reexecuteProject,
}: {
  project: {
    id: string;
    name: string;
    status?: string;
    shutdownActive?: boolean;
    description?: string;
    members?: {
      profileId: string;
      id?: string;
      profile?: {
        id: string;
        kind?: string;
        displayName?: string;
        username?: string;
        avatarUrl?: string;
        agent?: { id: string; role?: string };
      };
    }[];
  };
  reexecuteProject: (opts?: {
    requestPolicy?: "cache-first" | "cache-and-network" | "network-only" | "cache-only";
  }) => void;
}) {
  const [profilesResult] = useQuery({ query: PROFILES_QUERY });
  const allProfiles = profilesResult.data?.profiles ?? [];

  const [, executeUpdateProject] = useMutation(UPDATE_PROJECT);
  const [, executeArchiveProject] = useMutation(ARCHIVE_PROJECT);
  const [, executeRestoreProject] = useMutation(RESTORE_PROJECT);
  const [, executeAddMember] = useMutation(ADD_PROJECT_MEMBER);
  const [, executeRemoveMember] = useMutation(REMOVE_PROJECT_MEMBER);
  const [, executeSetProjectShutdown] = useMutation(SET_PROJECT_SHUTDOWN);

  const [isEditing, setIsEditing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "pause" | "resume" | null>(null);
  const [isTogglingShutdown, setIsTogglingShutdown] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDescription, setEditDescription] = useState(project.description ?? "");

  const memberProfileIds = project.members?.map((m) => m.profileId) ?? [];
  const squadLeadProfileId = allProfiles.find(
    (p: ProfileResult) => p.agent?.role === "Squad Lead",
  )?.id;

  const handleSave = async () => {
    if (!editName.trim()) return;
    try {
      await executeUpdateProject({
        id: project.id,
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setIsEditing(false);
      toast.success("Project updated");
    } catch {
      toast.error("Failed to update project");
    }
  };

  const handleArchive = async () => {
    try {
      await executeArchiveProject({ id: project.id });
      toast.success("Project archived");
    } catch {
      toast.error("Failed to archive project");
    }
  };

  const handleRestore = async () => {
    try {
      await executeRestoreProject({ id: project.id });
      toast.success("Project restored");
    } catch {
      toast.error("Failed to restore project");
    }
  };

  const handleToggleShutdown = async () => {
    setIsTogglingShutdown(true);
    try {
      const result = await executeSetProjectShutdown({
        projectId: project.id,
        active: !project.shutdownActive,
      });
      if (result.error) throw result.error;
      toast.success(
        project.shutdownActive ? "Project operations resumed" : "Project temporarily shut down",
      );
      reexecuteProject({ requestPolicy: "network-only" });
    } catch {
      toast.error("Failed to toggle project shutdown");
    } finally {
      setIsTogglingShutdown(false);
    }
  };

  const isArchived = project.status === "archived";
  const isShutdown = project.shutdownActive === true;

  const handleToggleMember = async (profileId: string) => {
    try {
      const isRemoving = memberProfileIds.includes(profileId);
      if (isRemoving) {
        await executeRemoveMember({ projectId: project.id, profileId });
      } else {
        await executeAddMember({ projectId: project.id, profileId });
      }
      toast.success(isRemoving ? "Member removed" : "Member added");
      reexecuteProject({ requestPolicy: "network-only" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update members");
    }
  };

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {isArchived && (
        <div className="flex items-center gap-3 px-4 py-3 bg-muted border border-border rounded-xl">
          <Archive className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">This project is archived</p>
            <p className="text-xs text-muted-foreground">
              No new tasks can be created or assigned.
            </p>
          </div>
          <Button
            variant="success"
            size="sm"
            icon={<RotateCcw />}
            onClick={handleRestore}
            className="shrink-0"
          >
            Restore
          </Button>
        </div>
      )}
      {isShutdown && !isArchived && (
        <div className="flex items-center gap-3 px-4 py-3 bg-warning-muted border border-warning/30 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">This project is paused</p>
            <p className="text-xs text-warning">
              Agents will not pick up new tasks in this project.
            </p>
          </div>
          <Button
            variant="success"
            size="sm"
            icon={isTogglingShutdown ? <Loader2 className="animate-spin" /> : <Power />}
            onClick={handleToggleShutdown}
            disabled={isTogglingShutdown}
            className="shrink-0"
          >
            Resume
          </Button>
        </div>
      )}

      {/* Header */}
      <Card padding="lg">
        {isEditing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-xl font-bold text-foreground border-0 border-b-2 border-gray-900 bg-transparent px-0 py-1 focus:outline-none focus:ring-0"
              autoFocus
            />
            <MarkdownEditor
              value={editDescription}
              onChange={setEditDescription}
              placeholder="Project description (supports markdown)"
              rows={4}
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" icon={<Check />} onClick={handleSave}>
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<X />}
                onClick={() => {
                  setIsEditing(false);
                  setEditName(project.name);
                  setEditDescription(project.description ?? "");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-foreground">{project.name}</h2>
                  {isArchived && <Badge variant="gray">Archived</Badge>}
                  {isShutdown && !isArchived && (
                    <Badge variant="yellow">
                      <ShieldOff className="w-3 h-3" />
                      Paused
                    </Badge>
                  )}
                </div>
                {project.description && (
                  <div className="text-sm text-muted-foreground mt-1 prose prose-sm prose-gray max-w-none">
                    <MarkdownWithMentions content={project.description} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isArchived ? (
                  <Button variant="success" size="sm" icon={<RotateCcw />} onClick={handleRestore}>
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil />}
                      onClick={() => setIsEditing(true)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant={isShutdown ? "success" : "warning"}
                      size="sm"
                      icon={<Power />}
                      onClick={() => setConfirmAction(isShutdown ? "resume" : "pause")}
                    >
                      {isShutdown ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Archive />}
                      onClick={() => setConfirmAction("archive")}
                      className="text-destructive hover:text-destructive hover:bg-destructive-muted"
                    >
                      Archive
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {memberProfileIds.length} member{memberProfileIds.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Docs */}
      <WhenFeatureEnabled flag={FLAG_KEYS.DOCUMENTS}>
        <ProjectDocsSection projectId={project.id} readOnly={isArchived} />
      </WhenFeatureEnabled>

      {/* Members */}
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-foreground mb-3">Team Members</h3>
        {isArchived ? (
          <div className="flex flex-wrap gap-2">
            {allProfiles
              .filter((p: ProfileResult) => memberProfileIds.includes(p.id))
              .map((p: ProfileResult) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border"
                >
                  <ProfileAvatar profileId={p.id} size="xs" />
                  {p.displayName || p.username || p.id}
                </span>
              ))}
            {memberProfileIds.length === 0 && (
              <p className="text-sm text-muted-foreground">No members</p>
            )}
          </div>
        ) : (
          <ProjectMemberEditor
            profiles={allProfiles}
            selectedIds={memberProfileIds}
            onToggle={handleToggleMember}
            disabledIds={squadLeadProfileId ? [squadLeadProfileId] : []}
          />
        )}
      </Card>

      {/* Archive confirmation */}
      <ConfirmDialog
        isOpen={confirmAction === "archive"}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          await handleArchive();
          setConfirmAction(null);
        }}
        title="Archive this project?"
        description="This will hide the project from active views. You can restore it later."
        confirmLabel="Archive"
        variant="danger"
      />

      {/* Pause / Resume confirmation */}
      <ConfirmDialog
        isOpen={confirmAction === "pause" || confirmAction === "resume"}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          await handleToggleShutdown();
          setConfirmAction(null);
        }}
        title={confirmAction === "pause" ? "Pause this project?" : "Resume this project?"}
        description={
          confirmAction === "pause"
            ? "Agents will not pick up new tasks in this project while it is paused."
            : "Agents will be able to receive tasks in this project again."
        }
        confirmLabel={confirmAction === "pause" ? "Pause" : "Resume"}
        variant={confirmAction === "pause" ? "danger" : "primary"}
        loading={isTogglingShutdown}
      />
    </div>
  );
}
