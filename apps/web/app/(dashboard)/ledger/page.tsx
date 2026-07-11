"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  LEDGER_SUMMARY_QUERY,
  LEDGER_BY_CATEGORY_QUERY,
  LEDGER_EVENTS_QUERY,
} from "@/lib/graphql/queries";
import { CREATE_LEDGER_EVENT, DELETE_LEDGER_EVENT } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

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

function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayISO(): string {
  // Deterministic yyyy-mm-dd for the date input default.
  return new Date().toISOString().slice(0, 10);
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
  const [{ data: evData }, refetchEvents] = useQuery<{
    ledgerEvents: { events: Event[]; nextCursor: string | null };
  }>({ query: LEDGER_EVENTS_QUERY, variables: { limit: 25 } });

  const [, createEvent] = useMutation(CREATE_LEDGER_EVENT);
  const [, deleteEvent] = useMutation(DELETE_LEDGER_EVENT);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: "expense",
    category: "",
    biller: "",
    amount: "",
    date: todayISO(),
    description: "",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const summary = sumData?.ledgerSummary;
  const cats = [...(catData?.ledgerByCategory ?? [])].sort((a, b) => b.totalCents - a.totalCents);
  const maxCat = cats.reduce((m, c) => Math.max(m, c.totalCents), 0) || 1;
  const events = evData?.ledgerEvents.events ?? [];

  function refresh() {
    refetchSummary({ requestPolicy: "network-only" });
    refetchCats({ requestPolicy: "network-only" });
    refetchEvents({ requestPolicy: "network-only" });
  }

  async function onCreate() {
    setFormError(null);
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!form.category.trim()) return setFormError("Category is required");
    if (!Number.isFinite(amountCents) || amountCents <= 0)
      return setFormError("Enter a positive amount");
    setBusy("create");
    try {
      const res = await createEvent({
        kind: form.kind,
        category: form.category.trim(),
        biller: form.biller.trim() || null,
        amountCents,
        description: form.description.trim() || null,
        occurredAt: new Date(form.date + "T00:00:00.000Z").toISOString(),
      });
      if (res.error) {
        setFormError(res.error.graphQLErrors[0]?.message ?? "Failed to record");
        return;
      }
      setForm((f) => ({ ...f, category: "", biller: "", amount: "", description: "" }));
      refresh();
    } finally {
      setBusy(null);
    }
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
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Ledger</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Your business revenue &amp; expenses (P&amp;L). Separate from agent run cost.
      </p>

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

      {/* Record an entry */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Record an entry</h2>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <select
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              <option value="revenue">revenue</option>
              <option value="expense">expense</option>
            </select>
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm sm:col-span-2"
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Biller / vendor"
              value={form.biller}
              onChange={(e) => setForm((f) => ({ ...f, biller: e.target.value }))}
            />
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Amount ($)"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <input
              type="date"
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <input
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <Button size="sm" disabled={busy === "create"} onClick={onCreate}>
              Add entry
            </Button>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </Card>
      </section>

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
