"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { TASK_EXTERNAL_LINKS_QUERY } from "@/lib/graphql/queries";
import { ADD_EXTERNAL_LINK, REMOVE_EXTERNAL_LINK } from "@/lib/graphql/mutations";

// Tier C: external object links (GitHub/GitLab/URL) attached to a task.
interface ExternalLink {
  id: string;
  kind: string;
  url: string;
  title: string | null;
}

const KIND_ICON: Record<string, string> = { github: "🐙", gitlab: "🦊", url: "🔗" };

export function TaskExternalLinksCard({ taskId }: { taskId: string }) {
  const [{ data }, refetch] = useQuery<{ taskExternalLinks: ExternalLink[] }>({
    query: TASK_EXTERNAL_LINKS_QUERY,
    variables: { taskId },
  });
  const [, addLink] = useMutation(ADD_EXTERNAL_LINK);
  const [, removeLink] = useMutation(REMOVE_EXTERNAL_LINK);

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const links = data?.taskExternalLinks ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    setErr(null);
    if (!url.trim()) return;
    setBusy(true);
    try {
      const res = await addLink({ taskId, url: url.trim(), title: title.trim() || null });
      if (res.error) setErr(res.error.graphQLErrors[0]?.message ?? "Failed to add link");
      else {
        setUrl("");
        setTitle("");
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    try {
      await removeLink({ id });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-foreground">External links</h3>
      <div className="space-y-1">
        {links.length === 0 && <p className="text-xs text-muted-foreground">No external links.</p>}
        {links.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-1.5 truncate text-primary hover:underline"
            >
              <span>{KIND_ICON[l.kind] ?? "🔗"}</span>
              <span className="truncate">{l.title || l.url}</span>
            </a>
            <button
              className="text-xs text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => onRemove(l.id)}
              aria-label="Remove link"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
          placeholder="https://github.com/org/repo/issues/1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          className="w-28 rounded border border-border bg-background px-2 py-1 text-sm"
          placeholder="Label"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          className="rounded bg-foreground px-3 py-1 text-sm text-background disabled:opacity-50"
          disabled={!url.trim() || busy}
          onClick={onAdd}
        >
          Add
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
