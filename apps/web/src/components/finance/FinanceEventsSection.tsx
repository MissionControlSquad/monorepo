"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import {
  FINANCE_EVENT_SUMMARY_QUERY,
  FINANCE_EVENTS_QUERY,
  COST_WINDOW_SPEND_QUERY,
  COST_BILLING_SPLIT_QUERY,
  PROVIDER_QUOTA_WINDOWS_QUERY,
  UNPRICED_COST_EVENTS_QUERY,
} from "@/lib/graphql/queries";
import { INGEST_FINANCE_EVENT, REPRICE_COST_EVENT } from "@/lib/graphql/mutations";
import { formatCents as money, FINANCE_EVENT_KINDS, COST_WINDOWS } from "@agentcenter/utils";
import { Card, Badge, Button } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";
import { WhenAdmin } from "@/components/auth/WhenAdmin";

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

interface QuotaWindow {
  label: string;
  usedPercent: number | null;
  resetsAt: string | null;
  valueLabel: string | null;
  detail: string | null;
}
interface QuotaResult {
  provider: string;
  ok: boolean;
  errorFamily: string | null;
  error: string | null;
  windows: QuotaWindow[];
}

// Domain 12 GAP-2: live provider rate-limit / quota windows (admin, PROVIDER_QUOTA-gated). Self-hides
// when the flag is off or no provider reports quota. Providers that error (bad/absent creds) are shown
// with their error rather than silently dropped.
function ProviderQuotaSection() {
  const [{ data, error }] = useQuery<{ providerQuotaWindows: QuotaResult[] }>({
    query: PROVIDER_QUOTA_WINDOWS_QUERY,
  });
  if (error) return null; // flag off / not admin — nothing to show
  const results = (data?.providerQuotaWindows ?? []).filter((r) => r.windows.length > 0 || !r.ok);
  if (results.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">Provider quota</h2>
      {results.map((r) => (
        <Card key={r.provider} className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{r.provider}</span>
            {!r.ok && <Badge variant="red">{r.errorFamily ?? "error"}</Badge>}
          </div>
          {!r.ok && r.error && <p className="text-xs text-muted-foreground">{r.error}</p>}
          {r.windows.map((w, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{w.label}</span>
                <span className="text-muted-foreground">
                  {w.valueLabel ?? (w.usedPercent != null ? `${Math.round(w.usedPercent)}%` : "")}
                </span>
              </div>
              {w.usedPercent != null && (
                <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                  <div
                    className={`h-full rounded ${w.usedPercent >= 90 ? "bg-red-500" : w.usedPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(Math.max(w.usedPercent, 0), 100)}%` }}
                  />
                </div>
              )}
              {w.detail && <p className="text-[11px] text-muted-foreground">{w.detail}</p>}
            </div>
          ))}
        </Card>
      ))}
    </section>
  );
}

interface UnpricedEvent {
  id: string;
  model: string | null;
  provider: string | null;
  tokensIn: number;
  tokensOut: number;
  amountCents: number;
  billingType: string;
  occurredAt: string;
}

// Domain 12 A13: cost events an agent reported without a real price. An admin enters the actual amount
// and repriceCostEvent corrects it + re-accrues budget windows. Self-hides when nothing is unpriced.
function UnpricedCostsSection() {
  const [{ data }, refetch] = useQuery<{ unpricedCostEvents: UnpricedEvent[] }>({
    query: UNPRICED_COST_EVENTS_QUERY,
    variables: { limit: 50 },
  });
  const [, reprice] = useMutation(REPRICE_COST_EVENT);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const events = data?.unpricedCostEvents ?? [];
  if (events.length === 0) return null;

  async function onReprice(id: string) {
    const cents = Math.round(Number(amounts[id]) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(id);
    try {
      const res = await reprice({ costEventId: id, amountCents: cents });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to reprice");
      else {
        toast.success("Cost repriced");
        setAmounts((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
        refetch({ requestPolicy: "network-only" });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        Unpriced costs
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
          {events.length}
        </span>
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground">
        Runs an agent reported without a final price. Enter the actual amount to correct spend and
        re-accrue budgets.
      </p>
      {events.map((e) => (
        <Card key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {e.model ?? e.provider ?? "cost event"}
              </span>
              <Badge variant="yellow" size="sm">
                unpriced
              </Badge>
              <span className="text-xs text-muted-foreground">
                {e.tokensIn.toLocaleString()} in · {e.tokensOut.toLocaleString()} out
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              current estimate {money(e.amountCents)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              value={amounts[e.id] ?? ""}
              onChange={(ev) => setAmounts((m) => ({ ...m, [e.id]: ev.target.value }))}
              placeholder="Actual ($)"
              inputMode="decimal"
              className="w-28"
            />
            <WhenAdmin>
              <Button
                size="sm"
                disabled={busy === e.id || !amounts[e.id]}
                onClick={() => onReprice(e.id)}
              >
                Reprice
              </Button>
            </WhenAdmin>
          </div>
        </Card>
      ))}
    </section>
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

      {/* Record a finance event (manage — admin/owner; server: INGEST_FINANCE_EVENT requires admin) */}
      <WhenAdmin>
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
      </WhenAdmin>

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

      <UnpricedCostsSection />
      <ProviderQuotaSection />
    </section>
  );
}
