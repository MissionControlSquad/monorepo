"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import {
  FINANCE_SUMMARY_QUERY,
  BUDGET_POLICIES_QUERY,
  BUDGET_INCIDENTS_QUERY,
  COST_BREAKDOWN_QUERY,
  COST_TREND_QUERY,
} from "@/lib/graphql/queries";
import {
  CREATE_BUDGET_POLICY,
  DELETE_BUDGET_POLICY,
  RESOLVE_BUDGET_INCIDENT,
  RAISE_BUDGET_AND_RESUME,
} from "@/lib/graphql/mutations";
import { BUDGET_WINDOWS, IncidentThreshold, formatCents as money } from "@agentcenter/utils";
import { Button, Card, Badge } from "@/components/ui";
import { FinanceEventsSection } from "@/components/finance/FinanceEventsSection";

// Epic #4: agent budgets / cost dashboard. API-gated by the BUDGETS feature + buildbase role
// (admin manages policies + resolves incidents; member views). All data is workspace-scoped
// server-side. Auto-pause incidents surface here so operators see paused agents live.

interface Summary {
  totalSpendCents: number;
  windowSpendCents: number;
  activePolicies: number;
  openIncidents: number;
}
interface Policy {
  id: string;
  scope: string;
  agentId: string | null;
  name: string;
  limitCents: number;
  window: string;
  hardStop: boolean;
  warnPercent: number;
  isActive: boolean;
}
interface Incident {
  id: string;
  policyId: string;
  agentId: string | null;
  status: string;
  thresholdType: string;
  spendCents: number;
  limitCents: number;
  autoPaused: boolean;
  detail: string | null;
  createdAt: string;
}
interface Bucket {
  key: string;
  label: string | null;
  amountCents: number;
  eventCount: number;
}

const WINDOWS = BUDGET_WINDOWS;

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}

export default function FinancePage() {
  const [{ data: sumData }, refetchSummary] = useQuery<{ financeSummary: Summary }>({
    query: FINANCE_SUMMARY_QUERY,
    variables: { window: "monthly" },
  });
  const [{ data: polData }, refetchPolicies] = useQuery<{ budgetPolicies: Policy[] }>({
    query: BUDGET_POLICIES_QUERY,
  });
  const [{ data: incData }, refetchIncidents] = useQuery<{ budgetIncidents: Incident[] }>({
    query: BUDGET_INCIDENTS_QUERY,
    variables: { status: "open" },
  });
  const [breakdownBy, setBreakdownBy] = useState("model");
  const [{ data: costData }] = useQuery<{ costBreakdown: Bucket[] }>({
    query: COST_BREAKDOWN_QUERY,
    variables: { groupBy: breakdownBy },
  });
  const [{ data: trendData }] = useQuery<{ costTrend: { date: string; amountCents: number }[] }>({
    query: COST_TREND_QUERY,
    variables: { days: 30 },
  });

  const [, createPolicy] = useMutation(CREATE_BUDGET_POLICY);
  const [, deletePolicy] = useMutation(DELETE_BUDGET_POLICY);
  const [, resolveIncident] = useMutation(RESOLVE_BUDGET_INCIDENT);
  const [, raiseAndResume] = useMutation(RAISE_BUDGET_AND_RESUME);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    limit: "",
    window: "monthly",
    hardStop: true,
    warn: "80",
  });
  const [raiseLimit, setRaiseLimit] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const summary = sumData?.financeSummary;
  const policies = polData?.budgetPolicies ?? [];
  const incidents = incData?.budgetIncidents ?? [];
  const buckets = [...(costData?.costBreakdown ?? [])].sort(
    (a, b) => b.amountCents - a.amountCents,
  );
  const maxBucket = buckets.reduce((m, b) => Math.max(m, b.amountCents), 0) || 1;

  async function onCreate() {
    setFormError(null);
    const limitCents = Math.round(Number(form.limit) * 100);
    if (!form.name.trim()) return setFormError("Name is required");
    if (!Number.isFinite(limitCents) || limitCents <= 0)
      return setFormError("Enter a positive limit");
    setBusy("create");
    try {
      const warnPercent = Math.round(Number(form.warn));
      const res = await createPolicy({
        scope: "workspace",
        name: form.name.trim(),
        limitCents,
        window: form.window,
        hardStop: form.hardStop,
        warnPercent: Number.isFinite(warnPercent) ? warnPercent : 80,
      });
      if (res.error) {
        setFormError(res.error.graphQLErrors[0]?.message ?? "Failed to create policy");
        return;
      }
      setForm({ name: "", limit: "", window: "monthly", hardStop: true, warn: "80" });
      refetchPolicies({ requestPolicy: "network-only" });
      refetchSummary({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string) {
    setBusy(id);
    try {
      await deletePolicy({ id });
      refetchPolicies({ requestPolicy: "network-only" });
      refetchSummary({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  async function onResolve(id: string) {
    setBusy(id);
    try {
      await resolveIncident({ id });
      refetchIncidents({ requestPolicy: "network-only" });
      refetchSummary({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  async function onRaiseResume(inc: Incident) {
    const dollars = Number(raiseLimit[inc.id]);
    const newLimitCents = Math.round(dollars * 100);
    if (!Number.isFinite(newLimitCents) || newLimitCents <= inc.spendCents) {
      setFormError(`New limit must exceed current spend (${money(inc.spendCents)})`);
      return;
    }
    setBusy(inc.id);
    try {
      const res = await raiseAndResume({ id: inc.id, newLimitCents });
      if (res.error) {
        setFormError(res.error.graphQLErrors[0]?.message ?? "Failed to raise & resume");
        return;
      }
      setFormError(null);
      refetchIncidents({ requestPolicy: "network-only" });
      refetchPolicies({ requestPolicy: "network-only" });
      refetchSummary({ requestPolicy: "network-only" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Finance &amp; Budgets</h1>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total spend" value={money(summary?.totalSpendCents ?? 0)} />
        <SummaryCard label="This month" value={money(summary?.windowSpendCents ?? 0)} />
        <SummaryCard label="Active budgets" value={String(summary?.activePolicies ?? 0)} />
        <SummaryCard label="Open incidents" value={String(summary?.openIncidents ?? 0)} />
      </div>

      {/* Open incidents */}
      {incidents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Open incidents</h2>
          {incidents.map((inc) => (
            <Card
              key={inc.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {inc.thresholdType === IncidentThreshold.HARD ? (
                    <Badge variant="red">hard breach</Badge>
                  ) : (
                    <Badge variant="yellow">soft warning</Badge>
                  )}
                  {inc.autoPaused && <Badge variant="orange">agent auto-paused</Badge>}
                  <span className="text-sm font-medium text-foreground">
                    {money(inc.spendCents)} / {money(inc.limitCents)}
                  </span>
                </div>
                {inc.detail && <p className="mt-1 text-sm text-muted-foreground">{inc.detail}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {inc.thresholdType === IncidentThreshold.HARD && inc.autoPaused && (
                  <>
                    <input
                      className="w-28 rounded border border-border bg-background px-2 py-1.5 text-sm"
                      placeholder="New limit ($)"
                      inputMode="decimal"
                      value={raiseLimit[inc.id] ?? ""}
                      onChange={(e) => setRaiseLimit((m) => ({ ...m, [inc.id]: e.target.value }))}
                    />
                    <Button size="sm" disabled={busy === inc.id} onClick={() => onRaiseResume(inc)}>
                      Raise &amp; resume
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === inc.id}
                  onClick={() => onResolve(inc.id)}
                >
                  Resolve
                </Button>
              </div>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">
            Plain <em>Resolve</em> closes the incident but does NOT reactivate a paused agent.
            <em> Raise &amp; resume</em> lifts the limit above current spend and restarts the agent.
          </p>
        </section>
      )}

      {/* Spend trend (last 30 days) */}
      {(() => {
        const trend = trendData?.costTrend ?? [];
        const max = trend.reduce((m, p) => Math.max(m, p.amountCents), 0) || 1;
        return (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Spend trend (30d)</h2>
            <Card className="p-4">
              {trend.length === 0 ? (
                <p className="text-sm text-muted-foreground">No spend recorded.</p>
              ) : (
                <div className="flex h-24 items-end gap-0.5">
                  {trend.map((p) => (
                    <div
                      key={p.date}
                      title={`${p.date}: ${money(p.amountCents)}`}
                      className="flex-1 rounded-t bg-primary/70"
                      style={{ height: `${Math.max((p.amountCents / max) * 100, 2)}%` }}
                    />
                  ))}
                </div>
              )}
            </Card>
          </section>
        );
      })()}

      {/* Spend breakdown */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Spend by {breakdownBy}</h2>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-xs"
            value={breakdownBy}
            onChange={(e) => setBreakdownBy(e.target.value)}
          >
            <option value="model">model</option>
            <option value="agent">agent</option>
            <option value="provider">provider</option>
            <option value="project">project</option>
            <option value="biller">biller</option>
            <option value="issue">issue</option>
            <option value="billingType">billing type</option>
          </select>
        </div>
        <Card className="space-y-3 p-4">
          {buckets.length === 0 && (
            <p className="text-sm text-muted-foreground">No cost recorded yet.</p>
          )}
          {buckets.map((b) => (
            <div key={b.key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="truncate text-foreground">{b.label ?? b.key}</span>
                <span className="text-muted-foreground">
                  {money(b.amountCents)} · {b.eventCount} events
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-indigo-500"
                  style={{ width: `${(b.amountCents / maxBucket) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </Card>
      </section>

      {/* Provider account activity: finance events + rolling windows + billing split */}
      <FinanceEventsSection />

      {/* Budget policies */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Budget policies</h2>

        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm sm:col-span-2"
              placeholder="Budget name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Limit ($)"
              inputMode="decimal"
              value={form.limit}
              onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))}
            />
            <select
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              value={form.window}
              onChange={(e) => setForm((f) => ({ ...f, window: e.target.value }))}
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <input
              className="rounded border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="Warn %"
              inputMode="numeric"
              value={form.warn}
              onChange={(e) => setForm((f) => ({ ...f, warn: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.hardStop}
                onChange={(e) => setForm((f) => ({ ...f, hardStop: e.target.checked }))}
              />
              Hard stop (auto-pause agents on breach)
            </label>
            <Button size="sm" disabled={busy === "create"} onClick={onCreate}>
              Add workspace budget
            </Button>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </Card>

        {policies.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No budget policies yet.
          </Card>
        )}

        {policies.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium text-foreground">{p.name}</span>
                <Badge variant="gray">{p.scope}</Badge>
                <Badge variant="blue">{p.window}</Badge>
                {p.hardStop && <Badge variant="orange">hard stop</Badge>}
                {!p.isActive && <Badge variant="gray">inactive</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Limit {money(p.limitCents)} · warn at {p.warnPercent}%
              </p>
            </div>
            <Button
              size="sm"
              variant="danger"
              disabled={busy === p.id}
              onClick={() => onDelete(p.id)}
            >
              Delete
            </Button>
          </Card>
        ))}
      </section>
    </div>
  );
}
