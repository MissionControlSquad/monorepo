"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { SKILL_COMMENTS_QUERY } from "@/lib/graphql/queries";
import { ADD_SKILL_COMMENT, DELETE_SKILL_COMMENT } from "@/lib/graphql/mutations";
import { Button, Input } from "@/components/ui";

// Threaded skill comments (parity #F12). Rendered inside a skill row's expandable panel. SKILLS_TEAMS-gated.
interface Comment {
  id: string; parentCommentId: string | null; authorProfileId: string | null; authorAgentId: string | null;
  body: string; deletedAt: string | null; createdAt: string;
}

export function SkillComments({ skillId }: { skillId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ skillComments: Comment[] }>({
    query: SKILL_COMMENTS_QUERY,
    variables: { skillId },
  });
  const [, add] = useMutation(ADD_SKILL_COMMENT);
  const [, del] = useMutation(DELETE_SKILL_COMMENT);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const comments = data?.skillComments ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function submit() {
    if (!body.trim()) return;
    await add({ skillId, body, parentCommentId: replyTo });
    setBody("");
    setReplyTo(null);
    refresh();
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      {fetching && comments.length === 0 && <p className="text-xs text-muted-foreground">Loading…</p>}
      {comments.length === 0 && !fetching && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      <ul className="space-y-2">
        {comments.map((c) => (
          <li key={c.id} className={c.parentCommentId ? "ml-6" : ""}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-sm ${c.deletedAt ? "italic text-muted-foreground" : "text-foreground"}`}>{c.body}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.authorAgentId ? `agent ${c.authorAgentId}` : c.authorProfileId ?? "someone"} · {new Date(c.createdAt).toLocaleString()}
                </p>
              </div>
              {!c.deletedAt && (
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setReplyTo(c.id)}>Reply</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await del({ id: c.id }); refresh(); }}>Delete</Button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          placeholder={replyTo ? "Reply…" : "Add a comment…"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {replyTo && <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button>}
        <Button size="sm" onClick={submit}>Post</Button>
      </div>
    </div>
  );
}
