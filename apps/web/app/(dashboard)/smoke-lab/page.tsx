"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { FlaskConical } from "lucide-react";
import { SMOKE_CASES_QUERY } from "@/lib/graphql/queries";
import {
  CREATE_SMOKE_CASE,
  DELETE_SMOKE_CASE,
  RUN_SMOKE_CASE,
  RUN_SMOKE_SUITE,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, EmptyState, FormField, FormDialog } from "@/components/ui";

// Tool smoke-lab (parity #153). SMOKE_LAB-gated, admin. Saved cases assert how a tool call should be
// admitted (allow/deny); running one drives the real tool gateway (access policy + content guards +
// plugin routing) and records pass/fail — validate your tool-access config before agents rely on it.
interface SmokeCase {
  id: string;
  name: string;
  toolName: string;
  expectDecision: string;
  lastResult: string | null;
  lastActual: string | null;
  lastRunAt: string | null;
}

const resultVariant = (r: string | null) =>
  r === "pass" ? "green" : r === "fail" ? "red" : r === "error" ? "orange" : "gray";

export default function SmokeLabPage() {
  const [{ data, fetching }, refetch] = useQuery<{ smokeCases: SmokeCase[] }>({ query: SMOKE_CASES_QUERY });
  const [, create] = useMutation(CREATE_SMOKE_CASE);
  const [, del] = useMutation(DELETE_SMOKE_CASE);
  const [, run] = useMutation(RUN_SMOKE_CASE);
  const [, runSuite] = useMutation(RUN_SMOKE_SUITE);

  const [form, setForm] = useState({ name: "", toolName: "", expectDecision: "allow" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const cases = data?.smokeCases ?? [];
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onCreate() {
    if (!form.name.trim() || !form.toolName.trim()) return;
    setBusy(true);
    setError(null);
    const r = await create(form);
    setBusy(false);
    if (r.error) return setError(r.error.message);
    setForm({ name: "", toolName: "", expectDecision: "allow" });
    setOpen(false);
    refresh();
  }

  async function onRunSuite() {
    setBusy(true);
    setSummary(null);
    const r = await runSuite({});
    setBusy(false);
    if (r.data?.runSmokeSuite) {
      const s = r.data.runSmokeSuite;
      setSummary(`${s.passed} passed · ${s.failed} failed · ${s.errored} errored`);
    }
    refresh();
  }

  return (
    <div className="mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tool smoke-lab</h1>
          <p className="text-sm text-muted-foreground">
            Assert how a tool call should be admitted, then run it through the real gateway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onRunSuite} disabled={busy || cases.length === 0}>
            {busy ? "Running…" : "Run all"}
          </Button>
          <Button onClick={() => setOpen(true)}>New case</Button>
        </div>
      </div>

      {summary && <p className="text-sm font-medium text-foreground">{summary}</p>}

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="New smoke case"
        description="Assert how a tool call should be admitted; running it drives the real gateway."
        onSubmit={onCreate}
        submitLabel="Add case"
        busy={busy}
        error={error}
        submitDisabled={!form.name.trim() || !form.toolName.trim()}
      >
        <FormField label="Case name">
          <Input
            placeholder="e.g. Block shell in prod"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField label="Tool name">
          <Input
            placeholder="e.g. shell"
            value={form.toolName}
            onChange={(e) => setForm({ ...form, toolName: e.target.value })}
          />
        </FormField>
        <FormField label="Expected decision">
          <select
            value={form.expectDecision}
            onChange={(e) => setForm({ ...form, expectDecision: e.target.value })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="allow">Expect allow</option>
            <option value="deny">Expect deny</option>
          </select>
        </FormField>
      </FormDialog>

      {cases.length === 0 && !fetching ? (
        <EmptyState icon={<FlaskConical className="h-8 w-8" />} title="No smoke cases" description="Add a case to validate your tool-access policy." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {cases.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{c.toolName}</span> · expect {c.expectDecision}
                    {c.lastActual && ` · got ${c.lastActual}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.lastResult && <Badge variant={resultVariant(c.lastResult)}>{c.lastResult}</Badge>}
                  <Button variant="ghost" size="sm" onClick={async () => { await run({ id: c.id }); refresh(); }}>
                    Run
                  </Button>
                  <Button variant="ghost" size="sm" onClick={async () => { await del({ id: c.id }); refresh(); }}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
