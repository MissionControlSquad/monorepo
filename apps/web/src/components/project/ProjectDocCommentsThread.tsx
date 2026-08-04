"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { PROJECT_DOC_COMMENTS_QUERY } from "@/lib/graphql/queries";
import {
  ADD_PROJECT_DOC_COMMENT,
  RESOLVE_PROJECT_DOC_COMMENT,
  DELETE_PROJECT_DOC_COMMENT,
} from "@/lib/graphql/mutations";
import { Button, Badge } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { TimeAgo } from "@/components/common/TimeAgo";

// Paperclip parity (document-annotations): human review comments on a project doc — add, resolve, delete.
interface DocComment {
  id: string;
  body: string;
  quote: string | null;
  resolved: boolean;
  createdAt: string;
}

export function ProjectDocCommentsThread({ docId }: { docId: string }) {
  const [{ data }, refetch] = useQuery<{ projectDocComments: DocComment[] }>({
    query: PROJECT_DOC_COMMENTS_QUERY,
    variables: { docId },
  });
  const [, add] = useMutation(ADD_PROJECT_DOC_COMMENT);
  const [, resolve] = useMutation(RESOLVE_PROJECT_DOC_COMMENT);
  const [, remove] = useMutation(DELETE_PROJECT_DOC_COMMENT);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const comments = data?.projectDocComments ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    if (!body.trim()) return;
    setBusy("add");
    try {
      const res = await add({ docId, body: body.trim(), quote: null });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to comment");
      else {
        setBody("");
        refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function onResolve(id: string, resolved: boolean) {
    setBusy(id);
    try {
      await resolve({ id, resolved });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string) {
    setBusy(id);
    try {
      await remove({ id });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> Comments ({comments.length})
      </h3>
      {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      <ul className="space-y-2">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg border border-border p-2.5">
            {c.quote && (
              <p className="mb-1 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                {c.quote}
              </p>
            )}
            <p
              className={`text-sm ${c.resolved ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {c.body}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {c.resolved && (
                <Badge variant="green" size="sm">
                  resolved
                </Badge>
              )}
              <TimeAgo date={c.createdAt} className="text-xs text-muted-foreground" />
              <button
                className="ml-auto text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                disabled={busy === c.id}
                onClick={() => onResolve(c.id, !c.resolved)}
              >
                {c.resolved ? "Reopen" : "Resolve"}
              </button>
              <button
                className="text-xs text-muted-foreground transition hover:text-destructive disabled:opacity-50"
                disabled={busy === c.id}
                onClick={() => onDelete(c.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <Button size="sm" disabled={busy === "add" || !body.trim()} onClick={onAdd}>
          Comment
        </Button>
      </div>
    </div>
  );
}
