"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { PROJECT_WORKSPACES_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_PROJECT_WORKSPACE,
  UPDATE_PROJECT_WORKSPACE,
  DELETE_PROJECT_WORKSPACE,
} from "@/lib/graphql/mutations";
import { useFeatureFlag } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS, WORKSPACE_STRATEGIES } from "@agentcenter/utils";
import { Card, Button, Badge, Tooltip } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

// Domain 3 (11-ui §7): execution workspaces for a project — the repo/setup/strategy templates a run
// clones into. CRUD; EXECUTION_WORKSPACES-gated (self-hides when off). Provision/teardown lifecycle is
// deferred (no backend). Lives on the project detail page.
interface Workspace {
  id: string;
  name: string;
  repoUrl: string | null;
  repoRef: string | null;
  setupCommand: string | null;
  cleanupCommand: string | null;
  defaultStrategy: string | null;
  isPrimary: boolean;
}

export function ProjectWorkspacesCard({ projectId }: { projectId: string }) {
  const enabled = useFeatureFlag(FLAG_KEYS.EXECUTION_WORKSPACES);
  const [{ data }, refetch] = useQuery<{ projectWorkspaces: Workspace[] }>({
    query: PROJECT_WORKSPACES_QUERY,
    variables: { projectId },
    pause: !enabled,
  });
  const [, create] = useMutation(CREATE_PROJECT_WORKSPACE);
  const [, update] = useMutation(UPDATE_PROJECT_WORKSPACE);
  const [, remove] = useMutation(DELETE_PROJECT_WORKSPACE);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    repoUrl: "",
    repoRef: "",
    setupCommand: "",
    defaultStrategy: "project_primary",
    isPrimary: false,
  });

  if (!enabled) return null;
  const workspaces = data?.projectWorkspaces ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onCreate() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy("create");
    try {
      const res = await create({
        projectId,
        name: form.name.trim(),
        repoUrl: form.repoUrl.trim() || null,
        repoRef: form.repoRef.trim() || null,
        setupCommand: form.setupCommand.trim() || null,
        defaultStrategy: form.defaultStrategy,
        isPrimary: form.isPrimary,
      });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to create");
        return;
      }
      toast.success("Workspace created");
      setForm({
        name: "",
        repoUrl: "",
        repoRef: "",
        setupCommand: "",
        defaultStrategy: "project_primary",
        isPrimary: false,
      });
      setOpen(false);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onMakePrimary(id: string) {
    setBusy(id);
    try {
      const res = await update({ id, isPrimary: true });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed");
      else refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete workspace "${name}"?`)) return;
    setBusy(id);
    try {
      const res = await remove({ id });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed");
      else {
        toast.success("Workspace deleted");
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Boxes className="h-4 w-4 text-muted-foreground" /> Execution workspaces
        </h2>
        <div className="flex items-center gap-2">
          {workspaces.length > 0 && (
            <Link
              href={`/projects/${projectId}/workspace`}
              className="text-sm font-medium text-primary hover:underline"
            >
              View details
            </Link>
          )}
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "New workspace"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name"
            />
            <div className="space-y-1">
              <select
                className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
                value={form.defaultStrategy}
                onChange={(e) => setForm((f) => ({ ...f, defaultStrategy: e.target.value }))}
              >
                {WORKSPACE_STRATEGIES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-snug text-muted-foreground">
                Default branch strategy for runs: project primary reuses the project checkout, git
                worktree isolates each run on its own branch, adapter managed lets the runtime
                handle it, and cloud sandbox clones inside a fresh throwaway box.
              </p>
            </div>
            <Input
              value={form.repoUrl}
              onChange={(e) => setForm((f) => ({ ...f, repoUrl: e.target.value }))}
              placeholder="Repo URL (optional)"
            />
            <Input
              value={form.repoRef}
              onChange={(e) => setForm((f) => ({ ...f, repoRef: e.target.value }))}
              placeholder="Repo ref / branch (optional)"
            />
          </div>
          <Input
            value={form.setupCommand}
            onChange={(e) => setForm((f) => ({ ...f, setupCommand: e.target.value }))}
            placeholder="Setup command (optional)"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isPrimary}
                onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
              />
              Primary workspace
            </label>
            <Button size="sm" disabled={busy === "create"} onClick={onCreate}>
              Create
            </Button>
          </div>
        </div>
      )}

      {workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">No execution workspaces defined.</p>
      ) : (
        <div className="space-y-2">
          {workspaces.map((w) => (
            <div key={w.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{w.name}</span>
                {w.isPrimary && (
                  <Badge variant="green" size="sm">
                    primary
                  </Badge>
                )}
                {w.defaultStrategy && (
                  <Badge variant="gray" size="sm">
                    {w.defaultStrategy.replace(/_/g, " ")}
                  </Badge>
                )}
                <span className="ml-auto flex gap-1">
                  {!w.isPrimary && (
                    <Tooltip content="Make this the default workspace new runs in this project clone from.">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === w.id}
                        onClick={() => onMakePrimary(w.id)}
                      >
                        Make primary
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip content="Delete this workspace template. Runs that already used it are unaffected.">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === w.id}
                      onClick={() => onDelete(w.id, w.name)}
                    >
                      Delete
                    </Button>
                  </Tooltip>
                </span>
              </div>
              {(w.repoUrl || w.setupCommand) && (
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {w.repoUrl && (
                    <p className="truncate font-mono">
                      {w.repoUrl}
                      {w.repoRef ? `#${w.repoRef}` : ""}
                    </p>
                  )}
                  {w.setupCommand && <p className="truncate font-mono">$ {w.setupCommand}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
