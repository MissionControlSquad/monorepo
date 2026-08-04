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
import { Button, Card } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

// Domain 14 #10/#12: Agent-Companies — the portable "company package" surface. Lets an admin create
// companies, delete them, export a company as a markdown package (downloaded as a path→content JSON
// bundle), and import such a bundle back (round-trip). AGENT_COMPANIES-gated + admin server-side.

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

  // Export runs the query imperatively, then downloads the package as a path→content JSON bundle —
  // exactly the shape importCompanyPackage(files) expects, so a company round-trips cleanly.
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
      const files: Record<string, string> = {};
      for (const f of res.data.exportCompanyPackage) files[f.path] = f.content;
      const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${company.slug}-company-package.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Package downloaded");
    } finally {
      setBusy(null);
    }
  }

  async function onImportFile(file: File) {
    setBusy("import");
    try {
      const text = await file.text();
      let files: Record<string, string>;
      try {
        files = JSON.parse(text);
      } catch {
        toast.error("Not a valid package JSON file");
        return;
      }
      const res = await importPackage({ files, sourceRef: file.name });
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
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
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
        <textarea
          value={form.goals}
          onChange={(e) => setForm((f) => ({ ...f, goals: e.target.value }))}
          placeholder="Goals — one per line (optional)"
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
