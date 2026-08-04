"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  LEDGER_SUMMARY_QUERY,
  LEDGER_BY_CATEGORY_QUERY,
  LEDGER_BY_PROJECT_QUERY,
  LEDGER_BY_BILLER_QUERY,
  LEDGER_EVENTS_QUERY,
} from "@/lib/graphql/queries";
import { DELETE_LEDGER_EVENT } from "@/lib/graphql/mutations";
import { formatCents as money } from "@agentcenter/utils";
import { Button, Card, Badge } from "@/components/ui";
import { LedgerEntryDialog } from "@/components/dialogs/LedgerEntryDialog";

// Epic #16: business finance ledger (human P&L). API-gated by the LEDGER feature + buildbase role
// (admin records/edits/deletes; member views). Workspace-scoped server-side. NOT agent cost (#4).

interface Summary {
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  currency: string;
  eventCount: number;
}
interface CatTotal {
  category: string;
  kind: string;
  totalCents: number;
  eventCount: number;
}
interface ProjectTotal {
  projectId: string | null;
  projectName: string;
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  eventCount: number;
}
interface BillerTotal {
  biller: string;
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  eventCount: number;
}
interface Event {
  id: string;
  kind: string;
  category: string;
  biller: string | null;
  amountCents: number;
  currency: string;
  description: string | null;
  occurredAt: string;
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? "text-foreground"}`}>{value}</div>
    </Card>
  );
}

export default function LedgerPage() {
  const [{ data: sumData }, refetchSummary] = useQuery<{ ledgerSummary: Summary }>({
    query: LEDGER_SUMMARY_QUERY,
  });
  const [{ data: catData }, refetchCats] = useQuery<{ ledgerByCategory: CatTotal[] }>({
    query: LEDGER_BY_CATEGORY_QUERY,
  });
  const [{ data: projData }, refetchProjects] = useQuery<{ ledgerByProject: ProjectTotal[] }>({
    query: LEDGER_BY_PROJECT_QUERY,
  });
  const [{ data: billerData }, refetchBillers] = useQuery<{ ledgerByBiller: BillerTotal[] }>({
    query: LEDGER_BY_BILLER_QUERY,
  });
  const [{ data: evData }, refetchEvents] = useQuery<{
    ledgerEvents: { events: Event[]; nextCursor: string | null };
  }>({ query: LEDGER_EVENTS_QUERY, variables: { limit: 25 } });

  const [, deleteEvent] = useMutation(DELETE_LEDGER_EVENT);

  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const summary = sumData?.ledgerSummary;
  const cats = [...(catData?.ledgerByCategory ?? [])].sort((a, b) => b.totalCents - a.totalCents);
  const maxCat = cats.reduce((m, c) => Math.max(m, c.totalCents), 0) || 1;
  const projects = projData?.ledgerByProject ?? [];
  const billers = billerData?.ledgerByBiller ?? [];
  const events = evData?.ledgerEvents.events ?? [];

  function refresh() {
    refetchSummary({ requestPolicy: "network-only" });
    refetchCats({ requestPolicy: "network-only" });
    refetchProjects({ requestPolicy: "network-only" });
    refetchBillers({ requestPolicy: "network-only" });
    refetchEvents({ requestPolicy: "network-only" });
  }

  async function onDelete(id: string) {
    setBusy(id);
    try {
      await deleteEvent({ id });
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Ledger</h1>
          <p className="text-sm text-muted-foreground">
            Your business revenue &amp; expenses (P&amp;L). Separate from agent run cost.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Record entry</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Revenue"
          value={money(summary?.revenueCents ?? 0)}
          tone="text-success"
        />
        <SummaryCard
          label="Expense"
          value={money(summary?.expenseCents ?? 0)}
          tone="text-destructive"
        />
        <SummaryCard
          label="Net"
          value={money(summary?.netCents ?? 0)}
          tone={(summary?.netCents ?? 0) < 0 ? "text-destructive" : "text-foreground"}
        />
        <SummaryCard label="Entries" value={String(summary?.eventCount ?? 0)} />
      </div>

      <LedgerEntryDialog open={open} onOpenChange={setOpen} onSaved={refresh} />

      {/* Spend/revenue by category */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">By category</h2>
        <Card className="space-y-3 p-4">
          {cats.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
          {cats.map((c) => (
            <div key={`${c.category}:${c.kind}`} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-2 truncate text-foreground">
                  {c.category}
                  <Badge variant={c.kind === "revenue" ? "green" : "red"}>{c.kind}</Badge>
                </span>
                <span className="text-muted-foreground">
                  {money(c.totalCents)} · {c.eventCount}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className={`h-full rounded ${c.kind === "revenue" ? "bg-success" : "bg-destructive"}`}
                  style={{ width: `${(c.totalCents / maxCat) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </section>

      {/* P&L by project — net = revenue − expense, per linked project */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">P&amp;L by project</h2>
        <Card className="space-y-2 p-4">
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          )}
          {projects.map((p) => (
            <div
              key={p.projectId ?? "none"}
              className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="truncate text-foreground">{p.projectName}</span>
              <span className="flex items-center gap-3">
                <span className="text-success">{money(p.revenueCents)}</span>
                <span className="text-destructive">−{money(p.expenseCents)}</span>
                <Badge variant={p.netCents >= 0 ? "green" : "red"}>
                  {p.netCents >= 0 ? money(p.netCents) : `−${money(-p.netCents)}`}
                </Badge>
                <span className="text-xs text-muted-foreground">{p.eventCount}</span>
              </span>
            </div>
          ))}
        </Card>
      </section>

      {/* By biller — who you bill / who bills you */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">By biller</h2>
        <Card className="space-y-2 p-4">
          {billers.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
          {billers.map((b) => (
            <div
              key={b.biller}
              className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="truncate text-foreground">{b.biller}</span>
              <span className="flex items-center gap-3">
                <span className="text-success">{money(b.revenueCents)}</span>
                <span className="text-destructive">−{money(b.expenseCents)}</span>
                <Badge variant={b.netCents >= 0 ? "green" : "red"}>
                  {b.netCents >= 0 ? money(b.netCents) : `−${money(-b.netCents)}`}
                </Badge>
                <span className="text-xs text-muted-foreground">{b.eventCount}</span>
              </span>
            </div>
          ))}
        </Card>
      </section>

      {/* Recent entries */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Recent entries</h2>
        {events.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">No entries yet.</Card>
        )}
        {events.map((e) => (
          <Card key={e.id} className="flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={e.kind === "revenue" ? "green" : "red"}>{e.kind}</Badge>
                <span className="font-medium text-foreground">{money(e.amountCents)}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {e.category}
                  {e.biller ? ` · ${e.biller}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {e.occurredAt.slice(0, 10)}
                {e.description ? ` — ${e.description}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="danger"
              disabled={busy === e.id}
              onClick={() => onDelete(e.id)}
            >
              Delete
            </Button>
          </Card>
        ))}
      </section>
    </div>
  );
}
