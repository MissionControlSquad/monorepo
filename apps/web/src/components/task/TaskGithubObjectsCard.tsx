"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { EXTERNAL_OBJECTS_QUERY } from "@/lib/graphql/queries";
import { UPSERT_EXTERNAL_OBJECT, REFRESH_EXTERNAL_OBJECT, DELETE_EXTERNAL_OBJECT } from "@/lib/graphql/mutations";
import { Button, Badge, Input } from "@/components/ui";

// External objects on a task (parity #59/#65/#66). EXTERNAL_OBJECTS-gated. Paste a GitHub URL / owner/
// repo#123; the server SSRF-guarded-fetches its metadata (title/state) and caches it, linked to the task.
interface ExternalObject {
  id: string; provider: string; objectType: string; externalId: string; url: string;
  title: string | null; state: string | null;
}
const typeIcon: Record<string, string> = { issue: "🐛", pull: "🔀", repo: "📦", commit: "⎇", file: "📄" };
const stateVariant = (s: string | null) => (s === "open" ? "green" : s === "closed" || s === "merged" ? "purple" : "gray");

export function TaskGithubObjectsCard({ taskId }: { taskId: string }) {
  const [{ data }, refetch] = useQuery<{ externalObjects: ExternalObject[] }>({
    query: EXTERNAL_OBJECTS_QUERY,
    variables: { linkedType: "task", linkedId: taskId },
  });
  const [, upsert] = useMutation(UPSERT_EXTERNAL_OBJECT);
  const [, refresh] = useMutation(REFRESH_EXTERNAL_OBJECT);
  const [, del] = useMutation(DELETE_EXTERNAL_OBJECT);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const objects = data?.externalObjects ?? [];
  const reload = () => refetch({ requestPolicy: "network-only" });

  async function onAdd() {
    if (!ref.trim()) return;
    setBusy(true); setErr(null);
    const r = await upsert({ reference: ref.trim(), linkedType: "task", linkedId: taskId });
    setBusy(false);
    if (r.error) return setErr(r.error.message);
    setRef(""); reload();
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">GitHub links</h3>
      <div className="flex items-center gap-2">
        <Input placeholder="GitHub URL or owner/repo#123" value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()} />
        <Button size="sm" onClick={onAdd} disabled={busy}>{busy ? "Fetching…" : "Add"}</Button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {objects.length > 0 && (
        <ul className="space-y-1">
          {objects.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <a href={o.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm text-foreground hover:underline">
                <span className="mr-1">{typeIcon[o.objectType] ?? "🔗"}</span>
                {o.title ?? o.externalId}
              </a>
              <span className="flex shrink-0 items-center gap-1">
                {o.state && <Badge variant={stateVariant(o.state)}>{o.state}</Badge>}
                <Button size="sm" variant="ghost" onClick={async () => { await refresh({ id: o.id }); reload(); }}>↻</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await del({ id: o.id }); reload(); }}>✕</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
