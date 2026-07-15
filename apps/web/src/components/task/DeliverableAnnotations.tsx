"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { DELIVERABLE_ANNOTATIONS_QUERY } from "@/lib/graphql/queries";
import {
  ADD_DELIVERABLE_ANNOTATION,
  RESOLVE_DELIVERABLE_ANNOTATION,
  DELETE_DELIVERABLE_ANNOTATION,
} from "@/lib/graphql/mutations";

// Tier C: review annotations on a deliverable — a comment thread, each item optionally quoting a
// snippet and resolvable.
interface Annotation {
  id: string;
  body: string;
  quote: string | null;
  resolved: boolean;
  createdAt: string;
}

export function DeliverableAnnotations({ deliverableId }: { deliverableId: string }) {
  const [{ data }, refetch] = useQuery<{ deliverableAnnotations: Annotation[] }>({
    query: DELIVERABLE_ANNOTATIONS_QUERY,
    variables: { deliverableId },
  });
  const [, addAnnotation] = useMutation(ADD_DELIVERABLE_ANNOTATION);
  const [, resolveAnnotation] = useMutation(RESOLVE_DELIVERABLE_ANNOTATION);
  const [, deleteAnnotation] = useMutation(DELETE_DELIVERABLE_ANNOTATION);

  const [body, setBody] = useState("");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);

  const annotations = data?.deliverableAnnotations ?? [];
  const open = annotations.filter((a) => !a.resolved).length;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addAnnotation({ deliverableId, body: body.trim(), quote: quote.trim() || null });
      setBody("");
      setQuote("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">
        Annotations {open > 0 && <span className="text-muted-foreground">({open} open)</span>}
      </h3>

      <div className="space-y-2">
        {annotations.length === 0 && (
          <p className="text-xs text-muted-foreground">No annotations yet.</p>
        )}
        {annotations.map((a) => (
          <div
            key={a.id}
            className={`rounded border border-border p-2 text-sm ${a.resolved ? "opacity-60" : ""}`}
          >
            {a.quote && (
              <blockquote className="mb-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                {a.quote}
              </blockquote>
            )}
            <div className="flex items-start justify-between gap-2">
              <span className={a.resolved ? "line-through" : ""}>{a.body}</span>
              <span className="flex shrink-0 gap-2 text-xs">
                <button
                  className="text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  onClick={async () => {
                    await resolveAnnotation({ id: a.id, resolved: !a.resolved });
                    refresh();
                  }}
                >
                  {a.resolved ? "reopen" : "resolve"}
                </button>
                <button
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={async () => {
                    await deleteAnnotation({ id: a.id });
                    refresh();
                  }}
                >
                  delete
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <input
          className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder="Quoted snippet (optional)"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
            placeholder="Add an annotation…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
          />
          <button
            className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
            disabled={!body.trim() || busy}
            onClick={onAdd}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
