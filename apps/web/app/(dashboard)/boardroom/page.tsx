"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "urql";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { BOARD_THREAD_QUERY } from "@/lib/graphql/queries";
import { SEND_BOARD_MESSAGE, SET_BOARD_MESSAGE_FEEDBACK } from "@/lib/graphql/mutations";
import { BOARD_ROLE } from "@agentcenter/utils";
import { Button, Card, Textarea } from "@/components/ui";
import { MarkdownComment } from "@/components/common/MarkdownComment";
import { BoardPrincipalsPanel } from "@/components/boardroom/BoardPrincipalsPanel";

// Epic #15: boardroom concierge chat. BOARD_CHAT-gated (experimental, admin). A standing per-workspace
// conversation; the LLM relay is a deferred seam, so replies come from the default relay for now.
// Assistant turns render as markdown and can be rated (thumbs up/down feedback).

interface Msg {
  id: string;
  role: string;
  body: string;
  feedbackScore: number | null;
  feedbackReason: string | null;
  createdAt: string;
}

const SUGGESTIONS = [
  "How are we doing this week?",
  "What needs my attention?",
  "Summarize the blocked work",
  "Which agents are over budget?",
];

export default function BoardroomPage() {
  const [{ data }, refetch] = useQuery<{ boardThread: { messages: Msg[] } }>({
    query: BOARD_THREAD_QUERY,
  });
  const [, send] = useMutation(SEND_BOARD_MESSAGE);
  const [, rate] = useMutation(SET_BOARD_MESSAGE_FEEDBACK);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const messages = data?.boardThread?.messages ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);
  const refresh = () => refetch({ requestPolicy: "network-only" });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function submit(body: string) {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await send({ body: text });
      setDraft("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function vote(m: Msg, dir: 1 | -1) {
    // Toggle off if the same vote is clicked again.
    await rate({ messageId: m.id, score: m.feedbackScore === dir ? 0 : dir, reason: null });
    refresh();
  }

  return (
    <div className="mx-auto flex h-full flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Boardroom</h1>
        <p className="text-sm text-muted-foreground">
          A standing conversation with your board concierge about running this workspace.
        </p>
      </div>

      <Card className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Ask the board concierge anything about running this workspace.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={busy}
                  onClick={() => submit(s)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.role === BOARD_ROLE.USER;
          return (
            <div key={m.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  isUser
                    ? "max-w-[80%] rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
                    : "max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
                }
              >
                <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
                  {isUser ? "You" : "Concierge"}
                </span>
                {isUser ? (
                  <span className="whitespace-pre-wrap">{m.body}</span>
                ) : (
                  <>
                    <MarkdownComment content={m.body} />
                    <div className="mt-1.5 flex items-center gap-1 border-t border-border/60 pt-1.5">
                      <button
                        onClick={() => vote(m, 1)}
                        title="Helpful"
                        className={`rounded p-1 hover:bg-background ${
                          m.feedbackScore === 1 ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => vote(m, -1)}
                        title="Not helpful"
                        className={`rounded p-1 hover:bg-background ${
                          m.feedbackScore === -1 ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </Card>

      <Card className="flex gap-2 p-3">
        <Textarea
          className="h-16 resize-none text-sm"
          placeholder="Message the board concierge…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(draft);
            }
          }}
        />
        <Button disabled={!draft.trim() || busy} onClick={() => submit(draft)}>
          Send
        </Button>
      </Card>

      {/* Board principals — first-class board identities that can act in the boardroom (admin). */}
      <BoardPrincipalsPanel />
    </div>
  );
}
