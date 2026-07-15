"use client";

import { useQuery, useMutation } from "urql";
import { ArrowBigUp, ArrowBigDown } from "lucide-react";
import { DELIVERABLE_VOTES_QUERY } from "@/lib/graphql/queries";
import { CAST_DELIVERABLE_VOTE } from "@/lib/graphql/mutations";

// Tier C: lightweight quality/prioritization votes on a deliverable (one up/down per member).
interface Summary {
  score: number;
  upCount: number;
  downCount: number;
  myVote: number;
}

export function DeliverableVotes({ deliverableId }: { deliverableId: string }) {
  const [{ data }, refetch] = useQuery<{ deliverableVotes: Summary }>({
    query: DELIVERABLE_VOTES_QUERY,
    variables: { deliverableId },
  });
  const [{ fetching }, castVote] = useMutation(CAST_DELIVERABLE_VOTE);
  const s = data?.deliverableVotes;
  const my = s?.myVote ?? 0;

  // Clicking the current vote clears it (toggle to 0); otherwise sets it.
  async function vote(value: 1 | -1) {
    await castVote({ deliverableId, value: my === value ? 0 : value });
    refetch({ requestPolicy: "network-only" });
  }

  return (
    <div className="flex items-center gap-1" title="Vote on this deliverable">
      <button
        aria-label="Upvote"
        disabled={fetching}
        onClick={() => vote(1)}
        className={`rounded p-1 transition-colors hover:bg-muted ${
          my === 1 ? "text-success" : "text-muted-foreground"
        }`}
      >
        <ArrowBigUp className="h-4 w-4" fill={my === 1 ? "currentColor" : "none"} />
      </button>
      <span
        className={`min-w-[1.5rem] text-center text-sm font-medium ${
          (s?.score ?? 0) > 0
            ? "text-success"
            : (s?.score ?? 0) < 0
              ? "text-destructive"
              : "text-foreground"
        }`}
      >
        {s?.score ?? 0}
      </span>
      <button
        aria-label="Downvote"
        disabled={fetching}
        onClick={() => vote(-1)}
        className={`rounded p-1 transition-colors hover:bg-muted ${
          my === -1 ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        <ArrowBigDown className="h-4 w-4" fill={my === -1 ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
