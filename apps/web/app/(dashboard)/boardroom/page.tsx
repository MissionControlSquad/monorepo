"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "urql";
import { BOARD_THREAD_QUERY } from "@/lib/graphql/queries";
import { SEND_BOARD_MESSAGE } from "@/lib/graphql/mutations";
import { BOARD_ROLE } from "@agentcenter/utils";
import { Button, Card } from "@/components/ui";

// Epic #15: boardroom concierge chat. BOARD_CHAT-gated (experimental, admin). A standing per-workspace
// conversation; the LLM relay is a deferred seam, so replies come from the default relay for now.

interface Msg {
  id: string;
  role: string;
  body: string;
  createdAt: string;
}

export default function BoardroomPage() {
  const [{ data }, refetch] = useQuery<{ boardThread: { messages: Msg[] } }>({
    query: BOARD_THREAD_QUERY,
  });
  const [, send] = useMutation(SEND_BOARD_MESSAGE);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const messages = data?.boardThread?.messages ?? [];
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function onSend() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await send({ body });
      setDraft("");
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Boardroom</h1>
        <p className="text-sm text-muted-foreground">
          A standing conversation with your board concierge about running this workspace.
        </p>
      </div>

      <Card className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet — ask the board concierge anything.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === BOARD_ROLE.USER ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                m.role === BOARD_ROLE.USER
                  ? "max-w-[80%] rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
                  : "max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
              }
            >
              <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
                {m.role === BOARD_ROLE.USER ? "You" : "Concierge"}
              </span>
              <span className="whitespace-pre-wrap">{m.body}</span>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </Card>

      <Card className="flex gap-2 p-3">
        <textarea
          className="h-16 flex-1 resize-none rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Message the board concierge…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <Button disabled={!draft.trim() || busy} onClick={onSend}>
          Send
        </Button>
      </Card>
    </div>
  );
}
