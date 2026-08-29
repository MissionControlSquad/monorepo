"use client";

import { useState } from "react";
import { useMutation } from "urql";
import { toast } from "sonner";
import { SET_PROJECT_SOURCE } from "@/lib/graphql/mutations";
import { Button, Card } from "../ui";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  PROJECT_SOURCE_TYPES,
  PROJECT_VISIBILITIES,
  PROJECT_SOURCE_TYPE,
  sourceTypeUsesRepo,
} from "@agentcenter/utils";

// Project source configuration section (Paperclip Project Workspace parity). Where the project's code
// lives + who can see it. Repo URL/ref only show for a remote_repo source.

const SOURCE_LABEL: Record<string, string> = {
  [PROJECT_SOURCE_TYPE.LOCAL_GIT]: "Local git repo",
  [PROJECT_SOURCE_TYPE.NON_GIT]: "Local folder (no git)",
  [PROJECT_SOURCE_TYPE.REMOTE_REPO]: "Remote repository",
  [PROJECT_SOURCE_TYPE.REMOTE_MANAGED]: "Remote-managed",
};

interface ProjectSource {
  id: string;
  sourceType?: string | null;
  repoUrl?: string | null;
  repoRef?: string | null;
  visibility?: string | null;
}

export function ProjectSourceCard({
  project,
  readOnly,
  onSaved,
}: {
  project: ProjectSource;
  readOnly?: boolean;
  onSaved?: () => void;
}) {
  const [, setSource] = useMutation(SET_PROJECT_SOURCE);
  const [sourceType, setSourceType] = useState(project.sourceType ?? "");
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");
  const [repoRef, setRepoRef] = useState(project.repoRef ?? "");
  const [visibility, setVisibility] = useState(project.visibility ?? "private");
  const [saving, setSaving] = useState(false);

  const usesRepo = sourceTypeUsesRepo(sourceType);

  async function save() {
    setSaving(true);
    try {
      const res = await setSource({
        projectId: project.id,
        sourceType: sourceType || null,
        repoUrl: usesRepo ? repoUrl || null : null,
        repoRef: usesRepo ? repoRef || null : null,
        visibility,
      });
      if (res.error) {
        toast.error(res.error.message.replace("[GraphQL] ", ""));
        return;
      }
      toast.success("Source updated");
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Source</h2>
        <p className="text-xs text-muted-foreground">
          Where this project&apos;s code lives and who can see it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Source type</span>
          <Select value={sourceType} onValueChange={setSourceType} disabled={readOnly}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Not set" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_SOURCE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABEL[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-snug text-muted-foreground">
            Where the code lives: a local git repo, a plain folder without git, or a remote
            repository agents clone for each run.
          </p>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Visibility</span>
          <Select value={visibility} onValueChange={setVisibility} disabled={readOnly}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_VISIBILITIES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-snug text-muted-foreground">
            Private: only project members can see it. Workspace: everyone in your workspace can.
          </p>
        </label>
      </div>

      {usesRepo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Repository URL</span>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              disabled={readOnly}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Ref (branch / tag)</span>
            <Input
              value={repoRef}
              onChange={(e) => setRepoRef(e.target.value)}
              placeholder="main"
              disabled={readOnly}
            />
            <p className="text-xs leading-snug text-muted-foreground">
              Branch, tag, or commit to check out. Leave blank to use the repo&apos;s default
              branch.
            </p>
          </label>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} loading={saving} disabled={saving}>
            Save source
          </Button>
        </div>
      )}
    </Card>
  );
}
