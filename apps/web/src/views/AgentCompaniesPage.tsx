"use client";

import { useState } from "react";
import { useQuery, useMutation, useClient } from "urql";
import { toast } from "sonner";
import { Building2, Download, Upload, Trash2 } from "lucide-react";
import { AGENT_COMPANIES_QUERY, EXPORT_COMPANY_PACKAGE_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_AGENT_COMPANY,
  DELETE_AGENT_COMPANY,
  IMPORT_COMPANY_PACKAGE,
} from "@/lib/graphql/mutations";
import { Button, Card, Textarea, Tooltip } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

// Domain 14 #10/#12: Agent-Companies — the portable "company package" surface. Lets an admin create
// companies, delete them, export a company as a markdown package (downloaded as a path→content JSON
// bundle, with a file-tree preview of every kind), and import such a bundle back (round-trip) after a
// confirmation that lists exactly what will be created. AGENT_COMPANIES-gated + admin server-side.

// The multi-kind package format (Domain 14): COMPANY.md + agents/<slug>/AGENTS.md, plus TEAM.md /
// PROJECT.md / TASK.md / SKILL.md. Classify a file by name for the import/export file tree + tooltips.
type PackageKind = "company" | "agent" | "team" | "project" | "task" | "skill" | "readme" | "other";

const KIND_TOOLTIP: Record<PackageKind, string> = {
  company: "COMPANY.md — the org itself: name, goals, license, provenance (agentcompanies/v1).",
  agent: "AGENTS.md — one agent persona: role + who it reports to. One per member agent.",
  team: "TEAM.md — a named group of agent roles you can install as a team.",
  project: "PROJECT.md — a project inside the company: description, status, goals.",
  task: "TASK.md — a single work item: title, status, assignee.",
  skill: "SKILL.md — a reusable capability module (frontmatter + instructions).",
  readme: "README.md — human-readable overview incl. the Mermaid org chart. Ignored on import.",
  other: "Supporting file — carried in the package but not a first-class kind.",
};

function classifyPackageFile(path: string): PackageKind {
  const p = path.trim();
  if (p === "COMPANY.md") return "company";
  if (/(^|\/)AGENTS\.md$/i.test(p)) return "agent";
  if (/(^|\/)TEAM\.md$/i.test(p)) return "team";
  if (/(^|\/)PROJECT\.md$/i.test(p)) return "project";
  if (/(^|\/)TASK\.md$/i.test(p)) return "task";
  if (/(^|\/)SKILL\.md$/i.test(p)) return "skill";
  if (/(^|\/)README\.md$/i.test(p)) return "readme";
  return "other";
}

interface Company {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  goals: string[];
  schemaVersion?: string | null;
  license?: string | null;
  createdAt: string;
}

interface ExportFile {
  path: string;
  content: string;
}

export function AgentCompaniesPage() {
  const [{ data, fetching, error }, refetch] = useQuery<{ agentCompanies: Company[] }>({
    query: AGENT_COMPANIES_QUERY,
  });
  const [, createCompany] = useMutation(CREATE_AGENT_COMPANY);
  const [, deleteCompany] = useMutation(DELETE_AGENT_COMPANY);
  const [, importPackage] = useMutation(IMPORT_COMPANY_PACKAGE);
  const client = useClient();

  const [form, setForm] = useState({ name: "", description: "", goals: "" });
  const [busy, setBusy] = useState<string | null>(null);
  // Staged import: parsed file map awaiting a confirmation that lists what will be created.
  const [pendingImport, setPendingImport] = useState<{
    files: Record<string, string>;
    name: string;
  } | null>(null);
  // Export preview: the emitted file tree shown before the user downloads it.
  const [exportPreview, setExportPreview] = useState<{
    slug: string;
    files: ExportFile[];
  } | null>(null);
  const companies = data?.agentCompanies ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onCreate() {
    if (!form.name.trim()) return;
    setBusy("create");
    try {
      const goals = form.goals
        .split("\n")
        .map((g) => g.trim())
        .filter(Boolean);
      const res = await createCompany({
        name: form.name.trim(),
        description: form.description.trim() || null,
        goals: goals.length ? goals : null,
      });
      if (res.error) {
        toast.error(String(res.error.message).replace("[GraphQL] ", ""));
        return;
      }
      toast.success("Company created");
      setForm({ name: "", description: "", goals: "" });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete company "${name}"? Agents are unassigned, not deleted.`)) return;
    setBusy(id);
    try {
      const res = await deleteCompany({ id });
      if (res.error) toast.error(String(res.error.message).replace("[GraphQL] ", ""));
      else {
        toast.success("Company deleted");
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  // Export runs the query imperatively, then shows a file-tree preview of the emitted package (every
  // kind) before the user downloads it as a path→content JSON bundle — exactly the shape
  // importCompanyPackage(files) expects, so a company round-trips cleanly.
  async function onExport(company: Company) {
    setBusy(company.id);
    try {
      const res = await client
        .query<{ exportCompanyPackage: ExportFile[] }>(EXPORT_COMPANY_PACKAGE_QUERY, {
          companyId: company.id,
        })
        .toPromise();
      if (res.error || !res.data) {
        toast.error(String(res.error?.message ?? "Export failed").replace("[GraphQL] ", ""));
        return;
      }
      setExportPreview({ slug: company.slug, files: res.data.exportCompanyPackage });
    } finally {
      setBusy(null);
    }
  }

  function downloadExport() {
    if (!exportPreview) return;
    const files: Record<string, string> = {};
    for (const f of exportPreview.files) files[f.path] = f.content;
    const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportPreview.slug}-company-package.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Package downloaded");
    setExportPreview(null);
  }

  // Import stages the parsed file map for a confirmation (below) rather than importing immediately.
  async function onImportFile(file: File) {
    const text = await file.text();
    let files: Record<string, string>;
    try {
      files = JSON.parse(text);
      if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("bad");
    } catch {
      toast.error("Not a valid package JSON file");
      return;
    }
    if (!Object.keys(files).some((p) => classifyPackageFile(p) === "company")) {
      toast.error("Package has no COMPANY.md");
      return;
    }
    setPendingImport({ files, name: file.name });
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setBusy("import");
    try {
      // The wire shape is an array of { path, content } (the shape exportCompanyPackage returns).
      const files = Object.entries(pendingImport.files).map(([path, content]) => ({
        path,
        content,
      }));
      const res = await importPackage({ files, sourceRef: pendingImport.name });
      if (res.error) {
        toast.error(String(res.error.message).replace("[GraphQL] ", ""));
        return;
      }
      const r = res.data?.importCompanyPackage as
        { slug: string; createdAgentIds: string[]; warnings: string[] } | undefined;
      toast.success(
        `Imported ${r?.slug ?? "company"} — ${r?.createdAgentIds?.length ?? 0} agent(s)` +
          (r?.warnings?.length ? `, ${r.warnings.length} warning(s)` : ""),
      );
      setPendingImport(null);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">Agent Companies</h1>
      </div>

      {/* Create */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-foreground">New company</h2>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Company name"
        />
        <Input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Description (optional)"
        />
        <Textarea
          value={form.goals}
          onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))}
          placeholder="Goals — one per line (optional)"
          rows={3}
        />
        <div className="flex items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <Upload className="h-4 w-4" />
            Import package
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={busy === "import"}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImportFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <Button size="sm" disabled={busy === "create" || !form.name.trim()} onClick={onCreate}>
            Create company
          </Button>
        </div>
      </Card>

      {/* Import confirmation: the file tree of what will be created (per kind, with tooltips). */}
      {pendingImport && (
        <Card className="space-y-3 border-primary/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Import “{pendingImport.name}”?
            </h2>
            <span className="text-xs text-muted-foreground">
              {Object.keys(pendingImport.files).length} file(s)
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            This will create the company and everything below. Nothing is created until you confirm.
          </p>
          <PackageFileTree paths={Object.keys(pendingImport.files)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy === "import"} onClick={confirmImport}>
              {busy === "import" ? "Importing…" : "Confirm import"}
            </Button>
          </div>
        </Card>
      )}

      {/* Export preview: the emitted package's file tree before download. */}
      {exportPreview && (
        <Card className="space-y-3 border-primary/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Export package — {exportPreview.slug}
            </h2>
            <span className="text-xs text-muted-foreground">
              {exportPreview.files.length} file(s)
            </span>
          </div>
          <PackageFileTree paths={exportPreview.files.map((f) => f.path)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExportPreview(null)}>
              Close
            </Button>
            <Button size="sm" onClick={downloadExport}>
              Download JSON
            </Button>
          </div>
        </Card>
      )}

      {fetching && <p className="text-sm text-muted-foreground">Loading companies…</p>}
      {error && <p className="text-sm text-destructive">Failed to load companies.</p>}
      {!fetching && !error && companies.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No companies yet. Create one above, or import a package.
        </Card>
      )}

      <div className="space-y-3">
        {companies.map((c) => (
          <Card key={c.id} className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">{c.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {c.slug}
                </span>
                {c.license && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {c.license}
                  </span>
                )}
              </div>
              {c.description && (
                <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
              )}
              {c.goals.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {c.goals.slice(0, 4).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === c.id}
                onClick={() => onExport(c)}
                title="Export package"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy === c.id}
                onClick={() => onDelete(c.id, c.name)}
                title="Delete"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<PackageKind, string> = {
  company: "Company",
  agent: "Agent",
  team: "Team",
  project: "Project",
  task: "Task",
  skill: "Skill",
  readme: "Readme",
  other: "Other",
};

// Renders a package's files grouped by kind, each with a per-kind tooltip. Shared by import + export.
function PackageFileTree({ paths }: { paths: string[] }) {
  const groups = new Map<PackageKind, string[]>();
  for (const p of [...paths].sort()) {
    const kind = classifyPackageFile(p);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(p);
  }
  const order: PackageKind[] = [
    "company",
    "agent",
    "team",
    "project",
    "task",
    "skill",
    "readme",
    "other",
  ];
  const kinds = order.filter((k) => groups.has(k));
  if (kinds.length === 0)
    return <p className="text-xs text-muted-foreground">No files in this package.</p>;
  return (
    <div className="space-y-2 rounded border border-dashed border-border p-3">
      {kinds.map((kind) => (
        <div key={kind}>
          <Tooltip content={KIND_TOOLTIP[kind]}>
            <span className="cursor-help text-xs font-semibold text-foreground underline decoration-dotted">
              {KIND_LABEL[kind]} ({groups.get(kind)!.length})
            </span>
          </Tooltip>
          <ul className="mt-1 list-inside list-disc pl-2 font-mono text-[11px] text-muted-foreground">
            {groups.get(kind)!.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
