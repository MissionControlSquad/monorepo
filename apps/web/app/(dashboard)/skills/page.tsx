"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { SKILLS_QUERY, SKILL_FILES_QUERY, SKILL_CATALOG_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_SKILL,
  FORK_SKILL,
  STAR_SKILL,
  DELETE_SKILL,
  UPDATE_SKILL,
  INSTALL_CATALOG_SKILL,
  UPSERT_SKILL_FILE,
  DELETE_SKILL_FILE,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #10: skills library. SKILLS_TEAMS-gated. Reusable markdown capability modules with versions,
// stars, forks; assign to agents from the agent view.

interface Skill {
  id: string;
  name: string;
  key: string;
  icon: string | null;
  tagline: string | null;
  currentVersion: number;
  starCount: number;
  installCount: number;
  forkCount: number;
  trustLevel: string;
  sharingScope: string;
  forkedFromSkillId: string | null;
}
interface CatalogSkill {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  tagline: string | null;
  author: string | null;
  starCount: number;
  installCount: number;
  forkCount: number;
  trustLevel: string;
}

export default function SkillsPage() {
  const [{ data }, refetch] = useQuery<{ skills: Skill[] }>({ query: SKILLS_QUERY });
  const [, createSkill] = useMutation(CREATE_SKILL);
  const [, forkSkill] = useMutation(FORK_SKILL);
  const [, starSkill] = useMutation(STAR_SKILL);
  const [, deleteSkill] = useMutation(DELETE_SKILL);
  const [, updateSkill] = useMutation(UPDATE_SKILL);
  const [, installCatalogSkill] = useMutation(INSTALL_CATALOG_SKILL);
  const [{ data: catData }, refetchCatalog] = useQuery<{ skillCatalog: CatalogSkill[] }>({
    query: SKILL_CATALOG_QUERY,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [openFiles, setOpenFiles] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    icon: "",
    tagline: "",
    markdown: "# Skill\n\nDescribe what the agent should do.",
  });
  const [error, setError] = useState<string | null>(null);
  const skills = data?.skills ?? [];
  const catalog = catData?.skillCatalog ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(null);
    }
  }
  async function onCreate() {
    setError(null);
    if (!form.name.trim()) return setError("Name is required");
    const res = await createSkill({
      name: form.name.trim(),
      markdown: form.markdown,
      icon: form.icon.trim() || null,
      tagline: form.tagline.trim() || null,
    });
    if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create");
    setForm({
      name: "",
      icon: "",
      tagline: "",
      markdown: "# Skill\n\nDescribe what the agent should do.",
    });
    refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Skills</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Reusable capability modules (markdown). Version on edit, fork, star, and assign to agents.
      </p>

      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5rem_1fr]">
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-center text-sm"
            placeholder="🧩"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Skill name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Tagline (optional)"
          value={form.tagline}
          onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
        />
        <textarea
          className="h-28 w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs"
          value={form.markdown}
          onChange={(e) => setForm((f) => ({ ...f, markdown: e.target.value }))}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={onCreate}>
            Create skill
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {/* Public catalog — skills other workspaces published (sharingScope=public). Install copies
          one into your workspace. */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Catalog {catalog.length > 0 && `(${catalog.length})`}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setShowCatalog((v) => !v)}>
          {showCatalog ? "Hide" : "Browse catalog"}
        </Button>
      </div>
      {showCatalog && (
        <Card className="space-y-2 p-4">
          {catalog.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No public skills yet. Publish one of yours to share it across workspaces.
            </p>
          )}
          {catalog.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm">
                {c.icon && <span className="text-base">{c.icon}</span>}
                <span className="font-medium text-foreground">{c.name}</span>
                {c.tagline && <span className="text-xs text-muted-foreground">— {c.tagline}</span>}
                {c.author && <Badge variant="gray">{c.author}</Badge>}
                <span className="text-xs text-muted-foreground">
                  ★ {c.starCount} · {c.installCount} agents · {c.forkCount} installs
                </span>
              </span>
              <Button
                size="sm"
                disabled={busy === c.id}
                onClick={() =>
                  act(async () => {
                    await installCatalogSkill({ skillId: c.id });
                  }, c.id)
                }
              >
                Install
              </Button>
            </div>
          ))}
        </Card>
      )}

      {skills.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No skills yet.</Card>
      )}
      {skills.map((s) => (
        <Card key={s.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              {s.icon && <span className="text-base">{s.icon}</span>}
              <span className="font-medium text-foreground">{s.name}</span>
              {s.tagline && <span className="text-xs text-muted-foreground">— {s.tagline}</span>}
              <Badge variant="gray">v{s.currentVersion}</Badge>
              <Badge variant="blue">{s.trustLevel}</Badge>
              {s.forkedFromSkillId && <Badge variant="purple">fork</Badge>}
              <span className="text-xs text-muted-foreground">
                ★ {s.starCount} · {s.installCount} agents · {s.forkCount} forks
              </span>
            </span>
            <span className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpenFiles((o) => (o === s.id ? null : s.id))}
              >
                Files
              </Button>
              <Button
                size="sm"
                variant={s.sharingScope === "public" ? "primary" : "secondary"}
                disabled={busy === s.id}
                title="Publish to the cross-workspace catalog"
                onClick={() =>
                  act(async () => {
                    await updateSkill({
                      id: s.id,
                      sharingScope: s.sharingScope === "public" ? "workspace" : "public",
                    });
                    refetchCatalog({ requestPolicy: "network-only" });
                  }, s.id)
                }
              >
                {s.sharingScope === "public" ? "Published" : "Publish"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === s.id}
                onClick={() => act(() => starSkill({ id: s.id }), s.id)}
              >
                Star
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === s.id}
                onClick={() => act(() => forkSkill({ id: s.id }), s.id)}
              >
                Fork
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy === s.id}
                onClick={() => {
                  if (confirm(`Delete skill "${s.name}"?`))
                    act(() => deleteSkill({ id: s.id }), s.id);
                }}
              >
                Delete
              </Button>
            </span>
          </div>
          {openFiles === s.id && <SkillFilesPanel skillId={s.id} />}
        </Card>
      ))}
    </div>
  );
}

interface SkillFile {
  id: string;
  path: string;
  content: string;
}

function SkillFilesPanel({ skillId }: { skillId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ skillFiles: SkillFile[] }>({
    query: SKILL_FILES_QUERY,
    variables: { skillId },
  });
  const [, upsertFile] = useMutation(UPSERT_SKILL_FILE);
  const [, deleteFile] = useMutation(DELETE_SKILL_FILE);
  const [draft, setDraft] = useState({ path: "", content: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const files = data?.skillFiles ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onSave() {
    setErr(null);
    if (!draft.path.trim()) return setErr("File path is required");
    setBusy(true);
    try {
      const res = await upsertFile({
        skillId,
        path: draft.path.trim(),
        content: draft.content,
      });
      if (res.error) return setErr(res.error.graphQLErrors[0]?.message ?? "Failed to save file");
      setDraft({ path: "", content: "" });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Bundle files ({files.length}) — SKILL.md is the entry doc; add supporting files here.
      </p>
      {fetching && <p className="text-xs text-muted-foreground">Loading…</p>}
      {files.map((f) => (
        <details key={f.id} className="rounded border border-border">
          <summary className="flex cursor-pointer items-center justify-between px-2 py-1 text-sm">
            <span className="font-mono text-xs text-foreground">{f.path}</span>
            <span className="flex gap-2">
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  setDraft({ path: f.path, content: f.content });
                }}
              >
                edit
              </button>
              <button
                className="text-xs text-destructive"
                onClick={async (e) => {
                  e.preventDefault();
                  await deleteFile({ skillId, path: f.path });
                  refresh();
                }}
              >
                delete
              </button>
            </span>
          </summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-border p-2 font-mono text-xs text-muted-foreground">
            {f.content}
          </pre>
        </details>
      ))}
      <div className="space-y-1 border-t border-border pt-2">
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          placeholder="path (e.g. scripts/run.py)"
          value={draft.path}
          onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
        />
        <textarea
          className="h-20 w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          placeholder="file content"
          value={draft.content}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
        />
        <div className="flex items-center justify-between">
          {err && <span className="text-xs text-destructive">{err}</span>}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onSave}
            className="ml-auto"
          >
            Save file
          </Button>
        </div>
      </div>
    </div>
  );
}
