"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { AGENT_SALARY_QUERY } from "@/lib/graphql/queries";
import { SET_AGENT_SALARY } from "@/lib/graphql/mutations";
import { Card, Button } from "@/components/ui";
import { Input } from "@/components/ui/shadcn/input";

interface Salary {
  id: string;
  limitCents: number;
  window: string;
  isSalary: boolean;
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Domain 14: an agent's monthly salary — a budget policy flagged isSalary. Admin-only server-side
 * (BUDGETS-gated). Setting it upserts the salary; the current amount is shown when one exists. Lives
 * on the agent profile alongside the other admin controls; no separate page (avoids duplication).
 */
export function AgentSalaryCard({ agentId }: { agentId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ agentSalary: Salary | null }>({
    query: AGENT_SALARY_QUERY,
    variables: { agentId },
    pause: !agentId,
  });
  const [, setSalary] = useMutation(SET_AGENT_SALARY);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const salary = data?.agentSalary;
  const current = salary?.isSalary ? salary.limitCents : null;

  async function onSet() {
    const monthlyCents = Math.round(Number(value) * 100);
    if (!Number.isFinite(monthlyCents) || monthlyCents <= 0) {
      toast.error("Enter a positive monthly amount");
      return;
    }
    setBusy(true);
    try {
      const res = await setSalary({ agentId, monthlyCents });
      if (res.error) {
        toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to set salary");
        return;
      }
      toast.success(`Salary set to ${money(monthlyCents)}/mo`);
      setValue("");
      refetch({ requestPolicy: "network-only" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Salary</h2>
        {current != null && (
          <span className="ml-auto text-sm font-medium text-foreground">
            {money(current)}
            <span className="text-xs text-muted-foreground"> / mo</span>
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {current != null
          ? "A monthly spend budget flagged as this agent's salary."
          : fetching
            ? "Loading…"
            : "No salary set. Assign a monthly spend budget for this agent."}
      </p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Monthly ($)"
          inputMode="decimal"
        />
        <Button size="sm" disabled={busy || !value.trim()} onClick={onSet}>
          {current != null ? "Update" : "Set salary"}
        </Button>
      </div>
    </Card>
  );
}
