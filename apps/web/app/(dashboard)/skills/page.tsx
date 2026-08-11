"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation } from "urql";
import {
  SKILLS_QUERY,
  SKILL_FILES_QUERY,
  SKILL_CATALOG_QUERY,
  SKILL_CATALOG_PACKAGES_QUERY,
  LINT_SKILL_QUERY,
  AUDIT_SKILL_QUERY,
  SKILL_VERSIONS_QUERY,
  SKILL_UPDATE_STATUS_QUERY,
  PROJECT_WORKSPACES_QUERY,
  PROJECT_WORKSPACE_SKILL_CANDIDATES_QUERY,
} from "@/lib/graphql/queries";
import {
  IMPORT_SKILL_PACKAGE,
  IMPORT_SKILL_FROM_SOURCE,
  IMPORT_SKILL_FROM_CATALOG,
  IMPORT_SKILL_FROM_PROJECT_SCAN,
  FORK_SKILL,
  STAR_SKILL,
  UNSTAR_SKILL,
  DELETE_SKILL,
  UPDATE_SKILL,
  INSTALL_CATALOG_SKILL,
  UPSERT_SKILL_FILE,
  DELETE_SKILL_FILE,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge, Textarea, Tooltip, EmptyState } from "@/components/ui";
import { Blocks } from "lucide-react";
import { SkillDialog } from "@/components/dialogs/SkillDialog";
import { SkillComments } from "@/components/skills/SkillComments";
import { SkillUpdatePanel } from "@/components/skills/SkillUpdatePanel";

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
  sourceType: string | null;
  sourceBadge: string | null;
  catalogKey: string | null;
  packageVersion: string | null;
  catalogKind: string | null;
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
  const [, importPackage] = useMutation(IMPORT_SKILL_PACKAGE);
  const importInput = useRef<HTMLInputElement>(null);
  async function onImport(files: FileList) {
    const payload = await Promise.all(
      Array.from(files).map(async (f) => ({
        path: (f as any).webkitRelativePath || f.name,
        content: await f.text(),
      })),
    );
    const r = await importPackage({ files: payload });
    if (!r.error) refetch({ requestPolicy: "network-only" });
  }
  const [, forkSkill] = useMutation(FORK_SKILL);
  const [, importFromProjectScan] = useMutation(IMPORT_SKILL_FROM_PROJECT_SCAN);
  const [, starSkill] = useMutation(STAR_SKILL);
  const [, unstarSkill] = useMutation(UNSTAR_SKILL);
  const [, deleteSkill] = useMutation(DELETE_SKILL);
  const [, updateSkill] = useMutation(UPDATE_SKILL);
  const [, installCatalogSkill] = useMutation(INSTALL_CATALOG_SKILL);
  const [{ data: catData }, refetchCatalog] = useQuery<{ skillCatalog: CatalogSkill[] }>({
    query: SKILL_CATALOG_QUERY,
  });

  const [busy, setBusy] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [openFiles, setOpenFiles] = useState<string | null>(null);
  const [openLint, setOpenLint] = useState<string | null>(null);
  const [openAudit, setOpenAudit] = useState<string | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [openUpdates, setOpenUpdates] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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

  // Fork with a duplicate-fork precheck: the server rejects a second fork of the same origin unless
  // `force` is set, so on that specific rejection we confirm with the user and retry with force.
  async function onFork(s: Skill) {
    setBusy(s.id);
    try {
      const res = await forkSkill({ id: s.id });
      const msg = res.error?.graphQLErrors[0]?.message ?? "";
      if (msg.includes("already has a fork")) {
        if (confirm(`${msg}.\n\nFork "${s.name}" again anyway?`)) {
          await forkSkill({ id: s.id, force: true });
        }
      }
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">Skills</h1>
        <div className="flex items-center gap-2">
          <input
            ref={importInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files?.length && onImport(e.target.files)}
          />
          <Button size="sm" variant="secondary" onClick={() => importInput.current?.click()}>
            Import package
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowImport((v) => !v)}>
            Import from source
          </Button>
          <Tooltip content="Scan a project workspace's checked-out repo for SKILL.md bundles and import one into this workspace.">
            <Button size="sm" variant="secondary" onClick={() => setShowProject((v) => !v)}>
              Import from project
            </Button>
          </Tooltip>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            New skill
          </Button>
        </div>
      </div>
      <p className="-mt-4 text-sm text-muted-foreground">
        Reusable capability modules (markdown). Version on edit, fork, star, and assign to agents.
      </p>

      <SkillDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={refresh} />

      {/* Domain 5 real-import: install from a GitHub/URL source or the app-shipped catalog. Admin-only
          on the server (importSkillFromSource / importSkillFromCatalog). */}
      {showImport && <ImportPanel onImported={refresh} />}

      {/* §3 project-workspace scan: pick a project workspace, scan its checked-out repo for SKILL.md
          bundles, and import one. Admin-only on the server (importSkillFromProjectScan). */}
      {showProject && (
        <ImportFromProjectPanel
          importScan={(vars) => importFromProjectScan(vars)}
          onImported={refresh}
        />
      )}

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
              <Tooltip content="Copies this published skill into your workspace as your own editable copy, so you can assign it to agents. Your copy stays independent of the original.">
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
              </Tooltip>
            </div>
          ))}
        </Card>
      )}

      {skills.length === 0 && (
        <EmptyState
          icon={<Blocks />}
          title="No skills yet"
          description="Create a capability module or import one, then assign it to your agents."
          action={<Button onClick={() => setCreateOpen(true)}>New skill</Button>}
        />
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
              <SourceBadge skill={s} />
              {s.forkedFromSkillId && <SkillLineageBadge skillId={s.id} />}
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
                variant="secondary"
                onClick={() => setOpenLint((o) => (o === s.id ? null : s.id))}
              >
                Test
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpenAudit((o) => (o === s.id ? null : s.id))}
              >
                Audit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpenVersions((o) => (o === s.id ? null : s.id))}
              >
                Versions
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpenComments((o) => (o === s.id ? null : s.id))}
              >
                Comments
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpenUpdates((o) => (o === s.id ? null : s.id))}
              >
                Updates
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
                Star ({s.starCount})
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === s.id || s.starCount === 0}
                onClick={() => act(() => unstarSkill({ id: s.id }), s.id)}
              >
                Unstar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy === s.id}
                onClick={() => onFork(s)}
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
          {openLint === s.id && <SkillLintPanel skillId={s.id} />}
          {openAudit === s.id && <SkillAuditPanel skillId={s.id} />}
          {openVersions === s.id && <SkillVersionsPanel skillId={s.id} />}
          {openComments === s.id && <SkillComments skillId={s.id} />}
          {openUpdates === s.id && (
            <SkillUpdatePanel
              skillId={s.id}
              onChanged={() => refetch({ requestPolicy: "network-only" })}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

interface CatalogPackage {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  trustLevel: string;
  packageName: string;
}

// Domain 5 real-import: install a skill from a GitHub/raw URL source spec, or from the app-shipped
// content-addressed catalog. Both writes are admin-gated server-side.
function ImportPanel({ onImported }: { onImported: () => void }) {
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [, importFromSource] = useMutation(IMPORT_SKILL_FROM_SOURCE);
  const [, importFromCatalog] = useMutation(IMPORT_SKILL_FROM_CATALOG);
  const [{ data }] = useQuery<{ skillCatalogPackages: CatalogPackage[] }>({
    query: SKILL_CATALOG_PACKAGES_QUERY,
  });
  const packages = data?.skillCatalogPackages ?? [];

  async function onImportSource() {
    setErr(null);
    setOk(null);
    if (!source.trim())
      return setErr(
        "Enter a GitHub URL/owner-repo, a GitHub folder, a raw file URL, a local path, or skillsh:<name>",
      );
    setBusy("source");
    try {
      const res = await importFromSource({ source: source.trim() });
      if (res.error) return setErr(res.error.graphQLErrors[0]?.message ?? "Import failed");
      setOk(`Imported "${res.data?.importSkillFromSource?.name}"`);
      setSource("");
      onImported();
    } finally {
      setBusy(null);
    }
  }

  async function onInstallCatalog(ref: string) {
    setErr(null);
    setOk(null);
    setBusy(ref);
    try {
      const res = await importFromCatalog({ ref });
      if (res.error) return setErr(res.error.graphQLErrors[0]?.message ?? "Install failed");
      setOk(`Installed "${res.data?.importSkillFromCatalog?.name}"`);
      onImported();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Import from source</p>
        <p className="text-xs text-muted-foreground">Paste a source spec. Admin only. Supported:</p>
        <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
          <li>
            GitHub single file - github.com/owner/repo/blob/main/path/SKILL.md (or
            owner/repo[/path])
          </li>
          <li>
            GitHub folder bundle - github.com/owner/repo/tree/main/skills/writer (SKILL.md +
            siblings)
          </li>
          <li>Raw file URL - https://…/SKILL.md</li>
          <li>skills.sh registry - skillsh:owner/repo/skill (or a https://skills.sh/… URL)</li>
          <li>Local path - local:./bundles/writer (server-side, allow-listed)</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-[16rem] flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-xs"
            placeholder="github.com/owner/repo/tree/main/writer  ·  skillsh:owner/repo/skill  ·  https://…/SKILL.md"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <Button size="sm" disabled={busy === "source"} onClick={onImportSource}>
            Import
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-sm font-semibold text-foreground">
          Catalog {packages.length > 0 && `(${packages.length})`}
        </p>
        {packages.length === 0 && (
          <p className="text-xs text-muted-foreground">No catalog packages available.</p>
        )}
        {packages.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
          >
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{p.name}</span>
              <span className="text-xs text-muted-foreground">— {p.description}</span>
              <Badge variant="gray">{p.category}</Badge>
              <Badge variant="blue">{p.trustLevel}</Badge>
            </span>
            <Tooltip content="Adds this catalog package to your workspace as a new, editable skill.">
              <Button size="sm" disabled={busy === p.id} onClick={() => onInstallCatalog(p.id)}>
                Install
              </Button>
            </Tooltip>
          </div>
        ))}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {ok && <p className="text-xs text-emerald-600">{ok}</p>}
    </Card>
  );
}

// §3 source badge: where a skill came from (catalog/github/url/local/project/forked/skillsh), rendered
// with an explanatory tooltip. Falls back to the raw sourceType when no badge was stamped.
const SOURCE_BADGE_TOOLTIP: Record<string, string> = {
  catalog: "Installed from the app-shipped skills catalog.",
  github: "Imported from a GitHub repository.",
  url: "Imported from a raw file URL.",
  local: "Imported from an allow-listed local path on the server.",
  project: "Discovered by scanning a project workspace's checked-out repo.",
  forked: "Forked from another skill in this workspace.",
  skillsh: "Imported from the skills.sh registry.",
};

function SourceBadge({ skill }: { skill: Skill }) {
  const badge = skill.sourceBadge ?? (skill.sourceType === "local_path" ? null : skill.sourceType);
  if (!badge) return null;
  const detail = SOURCE_BADGE_TOOLTIP[badge] ?? `Source: ${badge}.`;
  const provenance = [
    skill.catalogKey && `package ${skill.catalogKey}`,
    skill.packageVersion && `v${skill.packageVersion}`,
    skill.catalogKind && `(${skill.catalogKind})`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tooltip content={provenance ? `${detail} · ${provenance}` : detail}>
      <Badge variant="indigo">{badge}</Badge>
    </Tooltip>
  );
}

// §3 fork diverged-detection: for a fork, surface whether its origin has advanced since the fork
// (diverged) or an installed origin has an update, using the shared skillUpdateStatus resolver.
function SkillLineageBadge({ skillId }: { skillId: string }) {
  const [{ data }] = useQuery<{
    skillUpdateStatus: {
      state: string;
      originVersion: number | null;
      latestVersion: number | null;
    };
  }>({
    query: SKILL_UPDATE_STATUS_QUERY,
    variables: { skillId },
    requestPolicy: "cache-and-network",
  });
  const state = data?.skillUpdateStatus?.state;
  if (state === "diverged")
    return (
      <Tooltip content="This fork's origin has changed since you forked it — the fork and its origin have diverged. Reassign or reset to reconcile.">
        <Badge variant="yellow">diverged</Badge>
      </Tooltip>
    );
  if (state === "update_available")
    return (
      <Tooltip content="The origin this skill was installed from has published a newer version.">
        <Badge variant="orange">update available</Badge>
      </Tooltip>
    );
  if (state === "origin_gone")
    return (
      <Tooltip content="The origin this skill was forked/installed from no longer exists.">
        <Badge variant="red">origin gone</Badge>
      </Tooltip>
    );
  return null;
}

interface ProjectWorkspaceRow {
  id: string;
  name: string;
  projectId: string;
}
interface ProjectSkillCandidateRow {
  dir: string;
  name: string;
  fileCount: number;
  sourceRef: string;
}

// §3 project-workspace scan: choose a project workspace, scan its checked-out repo for SKILL.md
// bundles, and import a chosen one. Admin-gated on the server; the project list needs the
// EXECUTION_WORKSPACES flag, so it degrades to an empty list (with a hint) when unavailable.
function ImportFromProjectPanel({
  importScan,
  onImported,
}: {
  importScan: (vars: { projectWorkspaceId: string; dir?: string }) => Promise<{
    error?: { graphQLErrors: { message: string }[] };
    data?: { importSkillFromProjectScan?: { name: string } };
  }>;
  onImported: () => void;
}) {
  const [pwId, setPwId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [{ data: pwData, error: pwErr }] = useQuery<{ projectWorkspaces: ProjectWorkspaceRow[] }>({
    query: PROJECT_WORKSPACES_QUERY,
  });
  const workspaces = pwData?.projectWorkspaces ?? [];
  const [{ data: candData, fetching: scanning, error: scanErr }, refetchCandidates] = useQuery<{
    projectWorkspaceSkillCandidates: ProjectSkillCandidateRow[];
  }>({
    query: PROJECT_WORKSPACE_SKILL_CANDIDATES_QUERY,
    variables: { projectWorkspaceId: pwId },
    pause: !pwId,
    requestPolicy: "cache-and-network",
  });
  const candidates = candData?.projectWorkspaceSkillCandidates ?? [];

  async function onImportDir(dir: string, name: string) {
    setErr(null);
    setOk(null);
    if (!confirm(`Import skill "${name}" from this project workspace?`)) return;
    setBusy(dir);
    try {
      const res = await importScan({ projectWorkspaceId: pwId, dir });
      if (res.error) return setErr(res.error.graphQLErrors[0]?.message ?? "Import failed");
      setOk(`Imported "${res.data?.importSkillFromProjectScan?.name}"`);
      onImported();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Import from project</p>
        <p className="text-xs text-muted-foreground">
          Scans a project workspace&apos;s checked-out repo for <code>SKILL.md</code> bundles and
          imports one into this workspace. Admin only.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="min-w-[16rem] flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
          value={pwId}
          onChange={(e) => setPwId(e.target.value)}
        >
          <option value="">Select a project workspace…</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={!pwId || scanning}
          onClick={() => refetchCandidates({ requestPolicy: "network-only" })}
        >
          {scanning ? "Scanning…" : "Rescan"}
        </Button>
      </div>
      {pwErr && (
        <p className="text-xs text-muted-foreground">
          Project workspaces aren&apos;t available (the execution-workspaces feature may be off).
        </p>
      )}
      {pwId && scanErr && (
        <p className="text-xs text-destructive">
          {scanErr.graphQLErrors[0]?.message ?? "Could not scan this workspace."}
        </p>
      )}
      {pwId && !scanning && !scanErr && candidates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No <code>SKILL.md</code> bundles found in this workspace&apos;s checked-out files.
        </p>
      )}
      {candidates.map((c) => (
        <div
          key={c.sourceRef}
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
        >
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{c.dir || "."}</span>
            <Badge variant="gray">{c.fileCount} files</Badge>
          </span>
          <Tooltip content="Imports this SKILL.md bundle into your workspace as a new skill, stamped with project-scan provenance.">
            <Button size="sm" disabled={busy === c.dir} onClick={() => onImportDir(c.dir, c.name)}>
              Import
            </Button>
          </Tooltip>
        </div>
      ))}
      {err && <p className="text-xs text-destructive">{err}</p>}
      {ok && <p className="text-xs text-emerald-600">{ok}</p>}
    </Card>
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
        <Textarea
          className="h-20 font-mono text-xs"
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

interface LintFinding {
  level: string;
  path: string | null;
  message: string;
}

function SkillLintPanel({ skillId }: { skillId: string }) {
  const [{ data, fetching }] = useQuery<{ lintSkill: LintFinding[] }>({
    query: LINT_SKILL_QUERY,
    variables: { skillId },
    requestPolicy: "network-only",
  });
  const findings = data?.lintSkill ?? [];
  return (
    <div className="mt-2 space-y-1 rounded border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Validation {fetching ? "…" : findings.length === 0 ? "— all checks passed ✓" : ""}
      </p>
      {findings.map((f, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <Badge variant={f.level === "error" ? "red" : "yellow"}>{f.level}</Badge>
          <span>
            {f.path && <span className="font-mono text-muted-foreground">{f.path}: </span>}
            <span className="text-foreground">{f.message}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

interface AuditFinding {
  code: string;
  severity: string;
  message: string;
  path: string | null;
}

// Domain 5 GAP-D: static security audit of a skill bundle. Reuses the existing (previously unwired)
// auditSkill query.
function SkillAuditPanel({ skillId }: { skillId: string }) {
  const [{ data, fetching }] = useQuery<{
    auditSkill: { verdict: string; findings: AuditFinding[] };
  }>({
    query: AUDIT_SKILL_QUERY,
    variables: { skillId },
    requestPolicy: "network-only",
  });
  const audit = data?.auditSkill;
  const findings = audit?.findings ?? [];
  return (
    <div className="mt-2 space-y-1 rounded border border-dashed border-border p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        Security audit {fetching ? "…" : ""}
        {audit && (
          <Badge variant={audit.verdict === "pass" ? "green" : "red"}>{audit.verdict}</Badge>
        )}
      </p>
      {!fetching && findings.length === 0 && (
        <p className="text-xs text-muted-foreground">No findings.</p>
      )}
      {findings.map((f, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <Badge variant={f.severity === "high" || f.severity === "critical" ? "red" : "yellow"}>
            {f.severity}
          </Badge>
          <span>
            <span className="font-mono text-muted-foreground">{f.code}</span>
            {f.path && <span className="font-mono text-muted-foreground"> · {f.path}</span>}:{" "}
            <span className="text-foreground">{f.message}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

interface SkillVersionRow {
  id: string;
  revisionNumber: number;
  label: string | null;
  createdAt: string;
}

// Domain 5: skill bundle version history. New client op over the existing server skillVersions field.
function SkillVersionsPanel({ skillId }: { skillId: string }) {
  const [{ data, fetching }] = useQuery<{ skillVersions: SkillVersionRow[] }>({
    query: SKILL_VERSIONS_QUERY,
    variables: { skillId },
    requestPolicy: "network-only",
  });
  const versions = data?.skillVersions ?? [];
  return (
    <div className="mt-2 space-y-1 rounded border border-dashed border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Versions {fetching ? "…" : versions.length === 0 ? "— none yet" : `(${versions.length})`}
      </p>
      {versions.map((v) => (
        <div key={v.id} className="flex items-center gap-2 text-xs">
          <Badge variant="gray">r{v.revisionNumber}</Badge>
          <span className="text-foreground">{v.label ?? "—"}</span>
          <span className="ml-auto text-muted-foreground">
            {new Date(v.createdAt).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
