"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "urql";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { SEARCH_ALL_QUERY } from "@/lib/graphql/queries";
import { Card, Badge, PageLayout } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

// Full-page global search across six workspace scopes. Reads ?q= from the URL so results are
// shareable/bookmarkable; each hit links to its detail page.

interface Results {
  tasks: { id: string; taskNumber: number; title: string; status: string }[];
  messages: {
    id: string;
    content: string;
    taskId: string;
    task?: { title: string; taskNumber: number } | null;
  }[];
  deliverables: { id: string; title: string; task?: { taskNumber: number } | null }[];
  agents: { id: string; name: string; role: string }[];
  projects: { id: string; name: string }[];
  goals: { id: string; title: string; level: string }[];
}

const SCOPES = ["tasks", "messages", "deliverables", "agents", "projects", "goals"] as const;

export function SearchPage() {
  const router = useRouter();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const [text, setText] = useState(urlQ);

  useEffect(() => setText(urlQ), [urlQ]);

  const [{ data, fetching }] = useQuery<{ searchAll: Results }>({
    query: SEARCH_ALL_QUERY,
    variables: { searchText: urlQ, limit: 20 },
    pause: urlQ.trim().length < 2,
  });
  const r = data?.searchAll;

  const total = useMemo(() => (r ? SCOPES.reduce((n, s) => n + (r[s]?.length ?? 0), 0) : 0), [r]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <PageLayout maxWidth="default">
      <form onSubmit={submit} className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search tasks, messages, deliverables, agents, projects, goals…"
          className="pl-9"
        />
      </form>

      {urlQ.trim().length < 2 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Type at least two characters to search.
        </p>
      ) : fetching && !r ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No results for <span className="font-medium text-foreground">“{urlQ}”</span>. Try fewer or
          different words.
        </Card>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            {total} result{total === 1 ? "" : "s"} for “{urlQ}”
          </p>

          <Section title="Tasks" count={r?.tasks.length}>
            {r?.tasks.map((tk) => (
              <Row key={tk.id} href={`/task/${tk.id}`}>
                <span className="truncate">
                  #{tk.taskNumber} {tk.title}
                </span>
                <Badge variant="gray" size="sm">
                  {tk.status}
                </Badge>
              </Row>
            ))}
          </Section>

          <Section title="Agents" count={r?.agents.length}>
            {r?.agents.map((a) => (
              <Row key={a.id} href={`/agents?id=${a.id}`}>
                <span className="truncate font-medium">{a.name}</span>
                <Badge variant="gray" size="sm">
                  {a.role}
                </Badge>
              </Row>
            ))}
          </Section>

          <Section title="Projects" count={r?.projects.length}>
            {r?.projects.map((p) => (
              <Row key={p.id} href={`/projects/${p.id}`}>
                <span className="truncate">{p.name}</span>
              </Row>
            ))}
          </Section>

          <Section title="Goals" count={r?.goals.length}>
            {r?.goals.map((g) => (
              <Row key={g.id} href={`/goals/${g.id}`}>
                <span className="truncate">{g.title}</span>
                <Badge variant="gray" size="sm">
                  {g.level}
                </Badge>
              </Row>
            ))}
          </Section>

          <Section title="Deliverables" count={r?.deliverables.length}>
            {r?.deliverables.map((d) => (
              <Row key={d.id} href={`/deliverable/${d.id}`}>
                <span className="truncate">{d.title}</span>
                {d.task && (
                  <span className="text-xs text-muted-foreground">#{d.task.taskNumber}</span>
                )}
              </Row>
            ))}
          </Section>

          <Section title="Messages" count={r?.messages.length}>
            {r?.messages.map((m) => (
              <Row key={m.id} href={`/task/${m.taskId}`}>
                <span className="truncate text-muted-foreground">{m.content}</span>
                {m.task && (
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    #{m.task.taskNumber} {m.task.title}
                  </span>
                )}
              </Row>
            ))}
          </Section>
        </div>
      )}
    </PageLayout>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="space-y-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} · {count}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm text-foreground hover:bg-muted"
    >
      {children}
    </Link>
  );
}
