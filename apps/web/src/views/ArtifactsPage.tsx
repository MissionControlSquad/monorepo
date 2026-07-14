"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "urql";
import { FileText, Code, File, Link as LinkIcon, Loader2 } from "lucide-react";
import { WORKSPACE_DELIVERABLES_QUERY } from "@/lib/graphql/queries";
import { Card, Badge, PageLayout } from "@/components/ui";
import { DELIVERABLE_KINDS, DeliverableKind } from "@agentcenter/utils";

// Company-wide artifacts gallery — every deliverable produced across the workspace, filterable by
// media kind. Each card links to its source task (or opens the file/link).

interface Artifact {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  fileName: string | null;
  mimeType: string | null;
  createdAt: string;
  task?: { id: string; title: string; taskNumber: number } | null;
  profile?: { id: string; displayName: string } | null;
}

const KIND_ICON: Record<string, typeof FileText> = {
  [DeliverableKind.MARKDOWN]: FileText,
  [DeliverableKind.CODE]: Code,
  [DeliverableKind.FILE]: File,
  [DeliverableKind.LINK]: LinkIcon,
};

export function ArtifactsPage() {
  const [kind, setKind] = useState<string | null>(null);
  const [{ data, fetching }] = useQuery<{ workspaceDeliverables: Artifact[] }>({
    query: WORKSPACE_DELIVERABLES_QUERY,
    variables: { kind, limit: 120 },
  });
  const artifacts = useMemo(() => data?.workspaceDeliverables ?? [], [data]);

  return (
    <PageLayout maxWidth="wide">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Artifacts</h1>
        <p className="text-sm text-muted-foreground">
          Everything your agents have produced across the workspace.
        </p>
      </div>

      {/* Kind filter */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip label="All" active={kind === null} onClick={() => setKind(null)} />
        {DELIVERABLE_KINDS.map((k) => (
          <FilterChip key={k} label={k} active={kind === k} onClick={() => setKind(k)} />
        ))}
      </div>

      {fetching && artifacts.length === 0 ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : artifacts.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No artifacts{kind ? ` of kind “${kind}”` : ""} yet.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artifacts.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? File;
            const openHref =
              a.kind === DeliverableKind.LINK && a.url
                ? a.url
                : a.task
                  ? `/task/${a.task.id}`
                  : "#";
            const external = a.kind === DeliverableKind.LINK && !!a.url;
            return (
              <Link
                key={a.id}
                href={openHref}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">{a.title}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="gray" size="sm">
                    {a.kind}
                  </Badge>
                  {a.task && (
                    <span className="text-xs text-muted-foreground">#{a.task.taskNumber}</span>
                  )}
                  {a.profile && (
                    <span className="truncate text-xs text-muted-foreground">
                      · {a.profile.displayName}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
        active
          ? "border-transparent bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
