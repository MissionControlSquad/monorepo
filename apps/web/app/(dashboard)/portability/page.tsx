"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { EXPORT_WORKSPACE_BUNDLE, WORKSPACE_IMPORTS } from "@/lib/graphql/queries";
import { Button, Card, Badge, Textarea } from "@/components/ui";
import { PortabilityImportDialog } from "@/components/dialogs/PortabilityImportDialog";

// Epic #14: workspace portability. WORKSPACE_PORTABILITY-gated. Export renders a credential-free JSON
// bundle of the workspace's agents/projects/skills; import (admin) re-creates them with a collision
// strategy and shows a summary + audit history.

interface ImportSummary {
  createdAgents: number;
  skippedAgents: number;
  createdProjects: number;
  skippedProjects: number;
  createdSkills: number;
  skippedSkills: number;
}
interface ImportRow {
  id: string;
  bundleVersion: number;
  collisionStrategy: string;
  summary: ImportSummary;
  createdAgentIds: string[];
  createdProjectIds: string[];
  createdSkillIds: string[];
  createdAt: string;
}


export default function PortabilityPage() {
  const [{ data: exp }, refetchExport] = useQuery<{ exportWorkspaceBundle: unknown }>({
    query: EXPORT_WORKSPACE_BUNDLE,
  });
  const [{ data: hist }, refetchHist] = useQuery<{ workspaceImports: ImportRow[] }>({
    query: WORKSPACE_IMPORTS,
  });
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const bundle = exp?.exportWorkspaceBundle;
  const bundleJson = bundle ? JSON.stringify(bundle, null, 2) : "";
  const imports = hist?.workspaceImports ?? [];

  function download() {
    const blob = new Blob([bundleJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace-bundle.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Portability</h1>
          <p className="text-sm text-muted-foreground">
            Export this workspace&apos;s agents, projects, and skills as a portable JSON bundle, or
            import one into this workspace. Bundles never contain secrets or credentials.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Import bundle</Button>
      </div>

      <PortabilityImportDialog
        open={open}
        onOpenChange={setOpen}
        onImported={(s) => {
          setSummary(s);
          refetchHist({ requestPolicy: "network-only" });
        }}
      />

      {summary && (
        <Card className="border-success bg-success-muted p-4 text-sm text-foreground">
          Imported — {summary.createdAgents} agents ({summary.skippedAgents} skipped),{" "}
          {summary.createdProjects} projects ({summary.skippedProjects} skipped),{" "}
          {summary.createdSkills} skills ({summary.skippedSkills} skipped).
        </Card>
      )}

      {/* Export */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Export</h2>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => refetchExport({ requestPolicy: "network-only" })}
            >
              Refresh
            </Button>
            <Button size="sm" disabled={!bundleJson} onClick={download}>
              Download JSON
            </Button>
          </span>
        </div>
        <Textarea
          readOnly
          className="h-48 font-mono text-xs"
          value={bundleJson}
        />
      </Card>

      {/* History */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium text-foreground">Import history</h2>
        {imports.length === 0 && <p className="text-sm text-muted-foreground">No imports yet.</p>}
        {imports.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-sm last:border-0"
          >
            <span className="flex items-center gap-2">
              <Badge variant="gray">v{r.bundleVersion}</Badge>
              <Badge variant="blue">{r.collisionStrategy}</Badge>
              <span className="text-muted-foreground">
                {r.createdAgentIds.length} agents · {r.createdProjectIds.length} projects ·{" "}
                {r.createdSkillIds.length} skills
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(r.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
