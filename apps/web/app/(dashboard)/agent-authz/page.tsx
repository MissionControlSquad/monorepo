"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { AGENT_CAPABILITIES } from "@agentcenter/utils";
import {
  AGENTS_QUERY,
  AGENT_CAPABILITY_GRANTS_QUERY,
  AGENT_AUTHZ_EVENTS_QUERY,
} from "@/lib/graphql/queries";
import { GRANT_AGENT_CAPABILITY, REVOKE_AGENT_CAPABILITY } from "@/lib/graphql/mutations";
import { AGENT_AUTHZ_DECISION } from "@agentcenter/utils";
import { Button, Card, Badge } from "@/components/ui";

// Epic #21: agent authorization. AGENT_AUTHZ-gated. Grant capabilities to an agent (the agent analog
// of a human role) and review recent denials. Grants only bite when the agent is in restricted mode
// (trust "change consent required"); otherwise agents are open by default.

interface AgentLite {
  id: string;
  name: string;
  role: string;
}
interface Grant {
  id: string;
  capability: string;
  projectScope: string | null;
  createdAt: string;
}
interface AuthzEvent {
  id: string;
  capability: string;
  decision: string;
  reason: string | null;
  createdAt: string;
}

export default function AgentAuthzPage() {
  const [{ data: agentsData }] = useQuery<{ agents: AgentLite[] }>({ query: AGENTS_QUERY });
  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);
  const [agentId, setAgentId] = useState("");
  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const [{ data: grantsData }, refetchGrants] = useQuery<{ agentCapabilityGrants: Grant[] }>({
    query: AGENT_CAPABILITY_GRANTS_QUERY,
    variables: { agentId },
    pause: !agentId,
  });
  const [{ data: eventsData }, refetchEvents] = useQuery<{ agentAuthzEvents: AuthzEvent[] }>({
    query: AGENT_AUTHZ_EVENTS_QUERY,
    variables: { agentId },
    pause: !agentId,
  });
  const [, grant] = useMutation(GRANT_AGENT_CAPABILITY);
  const [, revoke] = useMutation(REVOKE_AGENT_CAPABILITY);

  const [cap, setCap] = useState<string>(AGENT_CAPABILITIES[0]);
  const [busy, setBusy] = useState(false);
  const grants = grantsData?.agentCapabilityGrants ?? [];
  const events = eventsData?.agentAuthzEvents ?? [];
  const grantedCaps = new Set(grants.map((g) => g.capability));

  function refresh() {
    refetchGrants({ requestPolicy: "network-only" });
    refetchEvents({ requestPolicy: "network-only" });
  }
  async function onGrant() {
    setBusy(true);
    try {
      await grant({ agentId, capability: cap });
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function onRevoke(id: string) {
    setBusy(true);
    try {
      await revoke({ grantId: id });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Agent authorization</h1>
          <p className="text-sm text-muted-foreground">
            Grant capabilities to an agent. Grants are enforced when the agent is restricted;
            otherwise agents run open by default.
          </p>
        </div>
        <select
          className="rounded border border-border bg-background px-3 py-1.5 text-sm"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          {agents.length === 0 && <option value="">No agents</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.role}
            </option>
          ))}
        </select>
      </div>

      {agentId && (
        <>
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <select
              className="rounded border border-border bg-background px-2 py-1 text-sm"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            >
              {AGENT_CAPABILITIES.map((c) => (
                <option key={c} value={c} disabled={grantedCaps.has(c)}>
                  {c}
                  {grantedCaps.has(c) ? " (granted)" : ""}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={busy || grantedCaps.has(cap)} onClick={onGrant}>
              Grant capability
            </Button>
          </Card>

          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-medium text-foreground">Granted capabilities</h2>
            {grants.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No explicit grants — this agent relies on its role defaults.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {grants.map((g) => (
                <span
                  key={g.id}
                  className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
                >
                  <code className="font-mono text-foreground">{g.capability}</code>
                  {g.projectScope && <Badge variant="purple">scoped</Badge>}
                  <button
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => onRevoke(g.id)}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </Card>

          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-medium text-foreground">Recent authorization events</h2>
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground">No denials recorded.</p>
            )}
            {events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between border-b border-border pb-1 text-sm last:border-0"
              >
                <span className="flex items-center gap-2">
                  <Badge variant={e.decision === AGENT_AUTHZ_DECISION.DENY ? "red" : "green"}>
                    {e.decision}
                  </Badge>
                  <code className="font-mono text-xs">{e.capability}</code>
                  <span className="text-xs text-muted-foreground">{e.reason}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
