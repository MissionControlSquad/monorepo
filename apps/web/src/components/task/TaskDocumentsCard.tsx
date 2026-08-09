"use client";

import { useState } from "react";
import { useQuery } from "urql";
import { FileText, ChevronRight } from "lucide-react";
import { DOCUMENTS_BY_TASK_QUERY } from "@/lib/graphql/queries";
import { DocumentAnnotations } from "./DocumentAnnotations";
import { Badge } from "@/components/ui";
import { TimeAgo } from "@/components/common/TimeAgo";

// Domain 11: agent-authored documents attached to a task (specs, notes, write-ups). Read-only viewer,
// keyed by taskId; renders nothing when the task has none. Complements the Deliverables list — these
// are prose docs, not code outputs. No new backend.
interface Doc {
  id: string;
  title: string;
  content: string | null;
  type: string | null;
  createdAt: string;
  createdBy?: { name: string; identityEmoji?: string | null } | null;
}

export function TaskDocumentsCard({ taskId }: { taskId: string }) {
  const [{ data }] = useQuery<{ documentsByTask: Doc[] }>({
    query: DOCUMENTS_BY_TASK_QUERY,
    variables: { taskId },
  });
  const [open, setOpen] = useState<string | null>(null);

  const docs = data?.documentsByTask ?? [];
  if (docs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <FileText className="h-3.5 w-3.5" /> Documents ({docs.length})
      </h3>
      <div className="space-y-1.5">
        {docs.map((d) => {
          const expanded = open === d.id;
          return (
            <div key={d.id} className="rounded-lg border border-border">
              <button
                className="flex w-full items-center gap-2 p-2.5 text-left"
                onClick={() => setOpen(expanded ? null : d.id)}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {d.title}
                </span>
                {d.type && (
                  <Badge variant="gray" size="sm">
                    {d.type}
                  </Badge>
                )}
              </button>
              {expanded && (
                <div className="border-t border-border p-2.5">
                  {d.content ? (
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
                      {d.content}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">No content.</p>
                  )}
                  {d.content && <DocumentAnnotations documentId={d.id} content={d.content} />}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {d.createdBy?.name ? `${d.createdBy.name} · ` : ""}
                    <TimeAgo date={d.createdAt} />
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
