"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { ANNOTATION_THREADS_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_ANNOTATION_THREAD, ADD_ANNOTATION_COMMENT, RESOLVE_ANNOTATION_THREAD,
} from "@/lib/graphql/mutations";
import { Button, Badge, Input } from "@/components/ui";

// Document anchored annotations (parity #G5). DOCUMENTS-gated. Select text in the doc and annotate it;
// threads re-anchor across revisions server-side (confidence shown). Add comments + resolve.
interface Comment { id: string; body: string; authorProfileId: string | null; createdAt: string }
interface Thread {
  id: string; quote: string; startOffset: number; endOffset: number; status: string; confidence: number;
  comments: Comment[];
}

export function DocumentAnnotations({ documentId, content }: { documentId: string; content: string }) {
  const [{ data }, refetch] = useQuery<{ annotationThreads: Thread[] }>({
    query: ANNOTATION_THREADS_QUERY,
    variables: { documentId },
  });
  const [, createThread] = useMutation(CREATE_ANNOTATION_THREAD);
  const [, addComment] = useMutation(ADD_ANNOTATION_COMMENT);
  const [, resolve] = useMutation(RESOLVE_ANNOTATION_THREAD);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const threads = data?.annotationThreads ?? [];
  const reload = () => refetch({ requestPolicy: "network-only" });

  async function annotateSelection() {
    const sel = window.getSelection()?.toString() ?? "";
    if (!sel.trim()) return setErr("Select some text in the document first.");
    const start = content.indexOf(sel);
    if (start < 0) return setErr("Couldn't locate the selection in the document.");
    setErr(null);
    const r = await createThread({ documentId, startOffset: start, endOffset: start + sel.length });
    if (r.error) return setErr(r.error.message);
    reload();
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border pt-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground">Annotations</h4>
        <Button size="sm" variant="ghost" onClick={annotateSelection}>Annotate selection</Button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {threads.length === 0 && <p className="text-xs text-muted-foreground">No annotations.</p>}
      <ul className="space-y-2">
        {threads.map((t) => (
          <li key={t.id} className="rounded-md border border-border p-2">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-xs italic text-muted-foreground">“{t.quote}”</p>
              <span className="flex shrink-0 items-center gap-1">
                {t.confidence < 1 && <Badge variant="yellow">{Math.round(t.confidence * 100)}%</Badge>}
                <Button size="sm" variant="ghost" onClick={async () => { await resolve({ threadId: t.id }); reload(); }}>Resolve</Button>
              </span>
            </div>
            <ul className="mt-1 space-y-1 pl-2">
              {t.comments.map((c) => (
                <li key={c.id} className="text-xs text-foreground">{c.body}</li>
              ))}
            </ul>
            <div className="mt-1 flex items-center gap-1">
              <Input
                className="h-7 text-xs"
                placeholder="Comment…"
                value={draft[t.id] ?? ""}
                onChange={(e) => setDraft({ ...draft, [t.id]: e.target.value })}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && (draft[t.id] ?? "").trim()) {
                    await addComment({ threadId: t.id, body: draft[t.id] });
                    setDraft({ ...draft, [t.id]: "" });
                    reload();
                  }
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
