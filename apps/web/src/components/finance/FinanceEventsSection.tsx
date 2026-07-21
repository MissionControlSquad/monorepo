"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import {
  FINANCE_EVENT_SUMMARY_QUERY,
  FINANCE_EVENTS_QUERY,
  COST_WINDOW_SPEND_QUERY,
  COST_BILLING_SPLIT_QUERY,
} from "@/lib/graphql/queries";
import { INGEST_FINANCE_EVENT } from "@/lib/graphql/mutations";
import { formatCents as money, FINANCE_EVENT_KINDS, COST_WINDOWS } from "@agentcenter/utils";
import { Card, Badge, Button } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

// Domain 12 GAP-1/6: account-level provider money (finance events) + rolling cost windows + the
// metered-vs-subscription billing split. Distinct from the per-inference cost breakdown already on
// this page and from the human P&L ledger. Reads member+, ingest is admin (BUDGETS-gated) server-side.

interface Summary {
  debitCents: number;
  creditCents: number;
  netCents: number;
  estimatedCents: number;
  count: number;
}
interface Split {
  meteredCents: number;
  subscriptionCents: number;
  otherCents: number;
  meteredCount: number;
  subscriptionCount: number;
  otherCount: number;
}
interface WindowRow {
  provider: string;
  window: string;
  amountCents: number;
  eventCount: number;
}
interface FinanceEvent {
  id: string;
  eventKind: string;
  direction: string;
  biller: string | null;
  provider: string | null;
  description: string | null;
  amountCents: number;
  currency: string;
  estimated: boolean;
  occurredAt: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </Card>
  );
}

export function FinanceEventsSection() {
  const [{ data: sum }, refetchSum] = useQuery<{ financeEventSummary: Summary }>({
    query: FINANCE_EVENT_SUMMARY_QUERY,
  });
  const [{ data: split }] = useQuery<{ costBillingSplit: Split }>({
    query: COST_BILLING_SPLIT_QUERY,
  });
  const [{ data: windows }] = useQuery<{ costWindowSpend: WindowRow[] }>({
    query: COST_WINDOW_SPEND_QUERY,
  });
  const [{ data: events }, refetchEvents] = useQuery<{ financeEvents: FinanceEvent[] }>({
    query: FINANCE_EVENTS_QUERY,
    variables: { limit: 25 },
  });
  const [, ingest] = useMutation(INGEST_FINANCE_EVENT);

  const [form, setForm] = useState({
    eventKind: "manual_adjustment",
    amount: "",
    direction: "debit",
    biller: "",
    description: "",
  });
  const [busy, setBusy] = useState(false);

  const s = sum?.financeEventSummary;
  const sp = split?.costBillingSplit;
  const rows = events?.financeEvents ?? [];

  // Fold rolling-window rows into a provider × window grid for a compact table.
  const winRows = windows?.costWindowSpend ?? [];
  const providers = [...new Set(winRows.map((r) => r.provider))].sort();
  const cell = (provider: string, w: string) =>
    winRows.find((r) => r.provider === provider && r.window === w);

  async function onIngest() {
    const amountCents = Math.round(Number(form.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setBusy(true);
    try {
      const res = await ingest({
        eventKind: form.eventKind,
        amountCents,
        direction: form.direction,
        biller: form.biller.trim() || null,
        description: form.description.trim() || null,
      });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to record event");
        return;
      }
      toast.success("Finance event recorded");
      setForm((f) => ({ ...f, amount: "", biller: "", description: "" }));
      refetchEvents({ requestPolicy: "network-only" });
      refetchSum({ requestPolicy: "network-only" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Provider account activity</h2>
      <p className="-mt-1 text-xs text-muted-foreground">
        Account-level provider money — credit purchases/refunds, platform &amp; BYOK fees, gateway
        overhead, storage — separate from per-inference cost and the business ledger.
      </p>

      {/* Finance-event summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Net" value={money(s?.netCents ?? 0)} />
        <Stat label="Debits" value={money(s?.debitCents ?? 0)} />
        <Stat label="Credits" value={money(s?.creditCents ?? 0)} />
        <Stat label="Estimated" value={money(s?.estimatedCents ?? 0)} />
      </div>

      {/* Metered vs subscription billing split */}
      {sp && (sp.meteredCount || sp.subscriptionCount || sp.otherCount) > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label={`Metered · ${sp.meteredCount}`} value={money(sp.meteredCents)} />
          <Stat
            label={`Subscription · ${sp.subscriptionCount}`}
            value={money(sp.subscriptionCents)}
          />
          <Stat label={`Other · ${sp.otherCount}`} value={money(sp.otherCents)} />
        </div>
      )}

      {/* Rolling per-provider spend windows */}
      {providers.length > 0 && (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">Provider</th>
                {COST_WINDOWS.map((w) => (
                  <th key={w.key} className="pb-2 text-right font-medium" title={w.label}>
                    {w.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p} className="border-t border-border">
                  <td className="py-1.5 text-foreground">{p}</td>
                  {COST_WINDOWS.map((w) => (
                    <td key={w.key} className="py-1.5 text-right text-muted-foreground">
                      {money(cell(p, w.key)?.amountCents ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Record a finance event (admin) */}
      <Card className="space-y-2 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm sm:col-span-2"
            value={form.eventKind}
            onChange={(e) => setForm((f) => ({ ...f, eventKind: e.target.value }))}
          >
            {FINANCE_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={form.direction}
            onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
          >
            <option value="debit">debit</option>
            <option value="credit">credit</option>
          </select>
          <Input
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="Amount ($)"
            inputMode="decimal"
          />
          <Input
            value={form.biller}
            onChange={(e) => setForm((f) => ({ ...f, biller: e.target.value }))}
            placeholder="Biller (optional)"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
          />
          <Button size="sm" disabled={busy || !form.amount.trim()} onClick={onIngest}>
            Record event
          </Button>
        </div>
      </Card>

      {/* Recent finance events */}
      <Card className="divide-y divide-border p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No finance events recorded.</p>
        ) : (
          rows.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{e.eventKind}</span>
                  <Badge variant={e.direction === "credit" ? "green" : "gray"}>{e.direction}</Badge>
                  {e.biller && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {e.biller}
                    </span>
                  )}
                  {e.estimated && <Badge variant="yellow">estimated</Badge>}
                </div>
                {e.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.description}</p>
                )}
              </div>
              <span
                className={`shrink-0 text-sm font-medium ${
                  e.direction === "credit" ? "text-green-600" : "text-foreground"
                }`}
              >
                {money(e.amountCents)}
              </span>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
