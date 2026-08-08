"use client";

import Link from "next/link";
import { useQuery } from "urql";
import { Loader2, AlertCircle, Boxes } from "lucide-react";
import { PROJECT_WORKSPACE_DETAIL_QUERY } from "@/lib/graphql/queries";
import { Breadcrumbs, Card, Badge, PageLayout } from "@/components/ui";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { useFeatureFlags } from "@/components/context/FeatureFlagContext";
import { FLAG_KEYS } from "@agentcenter/utils";
import { selectPrimaryProjectWorkspace, formatTimestamp } from "@/lib/work-detail";

// Detail route for a project's named workspace(s) (Tier D / Phase 3). The ProjectWorkspace is the
// reusable source template a run clones into: setup/cleanup commands, default strategy, and source
// settings. Reuses the workspace-scoped `projectWorkspaces` list resolver (no new server field) and
// selects the primary from that list. Read-only overview; CRUD stays on the project detail card.

interface ProjectWorkspace {
  id: string;
  projectId: string;
  name: string;
  sourceType: string | null;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  defaultRef: string | null;
  setupCommand: string | null;
  cleanupCommand: string | null;
  defaultStrategy: string | null;
  isPrimary: boolean;
  createdAt: string;
}

function ConfigRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-2">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`truncate text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value && value.length > 0 ? value : "—"}
      </dd>
    </div>
  );
}

function CommandBlock({ label, command }: { label: string; command: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {command && command.trim().length > 0 ? (
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-2 font-mono text-xs text-foreground">
          $ {command}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">None configured.</p>
      )}
    </div>
  );
}

function WorkspaceCard({ ws }: { ws: ProjectWorkspace }) {
  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Boxes className="h-4 w-4 text-muted-foreground" /> {ws.name}
        </h2>
        {ws.isPrimary && (
          <Badge variant="green" size="sm">
            primary
          </Badge>
        )}
        {ws.defaultStrategy && (
          <Badge variant="gray" size="sm">
            {ws.defaultStrategy.replace(/_/g, " ")}
          </Badge>
        )}
        {ws.sourceType && (
          <Badge variant="blue" size="sm">
            {ws.sourceType}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Created {formatTimestamp(ws.createdAt)}
        </span>
      </div>

      {/* Source settings */}
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ConfigRow label="Source type" value={ws.sourceType} />
        <ConfigRow
          label="Default strategy"
          value={ws.defaultStrategy?.replace(/_/g, " ") ?? null}
        />
        <ConfigRow label="Working directory" value={ws.cwd} mono />
        <ConfigRow label="Repo URL" value={ws.repoUrl} mono />
        <ConfigRow label="Repo ref" value={ws.repoRef} mono />
        <ConfigRow label="Default ref" value={ws.defaultRef} mono />
      </dl>

      {/* Lifecycle commands */}
      <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
        <CommandBlock label="Setup command" command={ws.setupCommand} />
        <CommandBlock label="Cleanup command" command={ws.cleanupCommand} />
      </div>
    </Card>
  );
}

export function ProjectWorkspaceDetailPage({ projectId }: { projectId: string }) {
  const { isEnabled } = useFeatureFlags();
  const enabled = isEnabled(FLAG_KEYS.EXECUTION_WORKSPACES);

  const [{ data, fetching, error }] = useQuery<{ projectWorkspaces: ProjectWorkspace[] }>({
    query: PROJECT_WORKSPACE_DETAIL_QUERY,
    variables: { projectId },
    pause: !enabled,
  });

  const crumbs = (
    <Breadcrumbs
      items={[
        { label: "Home", href: "/" },
        { label: "Projects", href: "/projects" },
        { label: "Project", href: `/projects/${projectId}` },
        { label: "Workspace" },
      ]}
    />
  );

  if (!enabled) {
    return (
      <PageLayout maxWidth="wide">
        {crumbs}
        <Card padding="lg" className="text-center text-sm text-muted-foreground">
          Execution workspaces are not enabled for this workspace.
        </Card>
      </PageLayout>
    );
  }

  if (fetching && !data) {
    return (
      <PageLayout maxWidth="wide">
        {crumbs}
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout maxWidth="wide">
        {crumbs}
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm font-medium">Could not load this project&apos;s workspaces</p>
        </div>
      </PageLayout>
    );
  }

  const workspaces = data?.projectWorkspaces ?? [];
  const primary = selectPrimaryProjectWorkspace(workspaces);
  // Primary first, then the rest in the resolver's order.
  const ordered = primary
    ? [primary, ...workspaces.filter((w) => w.id !== primary.id)]
    : workspaces;

  return (
    <PageLayout maxWidth="wide">
      {crumbs}

      <div className="space-y-4">
        <Card padding="lg" className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-foreground">Project workspaces</h1>
            <Link
              href={`/projects/${projectId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Back to project
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            The reusable source templates a run clones into - setup command, default strategy, and
            source settings. Manage them from the project&apos;s Execution workspaces section.
          </p>
        </Card>

        {ordered.length === 0 ? (
          <Card padding="lg" className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              No workspaces defined for this project yet.
            </p>
            <div>
              <Link
                href={`/projects/${projectId}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Create one on the project page
              </Link>
            </div>
          </Card>
        ) : (
          ordered.map((ws) => <WorkspaceCard key={ws.id} ws={ws} />)
        )}
      </div>
    </PageLayout>
  );
}
