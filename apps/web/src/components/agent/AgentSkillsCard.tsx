"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { toast } from "sonner";
import { AGENT_SKILLS_QUERY, SKILLS_QUERY } from "@/lib/graphql/queries";
import { ASSIGN_SKILL, UNASSIGN_SKILL } from "@/lib/graphql/mutations";
import { Card, Button, Badge } from "@/components/ui";

// Epic #10: assign reusable skills to an agent. This is the UI home for agentSkills(agentId) +
// assign/unassign — the skills library is authored on /skills, attached to agents here.
interface AgentSkill {
  id: string;
  skillId: string;
  skill: { id: string; name: string; icon: string | null } | null;
}
interface SkillOption {
  id: string;
  name: string;
  icon: string | null;
}

export function AgentSkillsCard({ agentId }: { agentId: string }) {
  const [{ data, fetching }, refetch] = useQuery<{ agentSkills: AgentSkill[] }>({
    query: AGENT_SKILLS_QUERY,
    variables: { agentId },
  });
  const [{ data: allData }] = useQuery<{ skills: SkillOption[] }>({ query: SKILLS_QUERY });
  const [, assignSkill] = useMutation(ASSIGN_SKILL);
  const [, unassignSkill] = useMutation(UNASSIGN_SKILL);

  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const assigned = data?.agentSkills ?? [];
  const assignedIds = new Set(assigned.map((a) => a.skillId));
  const available = (allData?.skills ?? []).filter((s) => !assignedIds.has(s.id));
  const refresh = () => refetch({ requestPolicy: "network-only" });

  async function onAssign() {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await assignSkill({ agentId, skillId: pick });
      if (res.error) toast.error(res.error.graphQLErrors[0]?.message ?? "Failed to assign skill");
      else {
        setPick("");
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onUnassign(skillId: string) {
    setBusy(true);
    try {
      await unassignSkill({ agentId, skillId });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Skills</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Reusable capability modules this agent has. Author skills on the Skills page, then attach
          them here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {fetching && <span className="text-xs text-muted-foreground">Loading…</span>}
        {!fetching && assigned.length === 0 && (
          <span className="text-xs text-muted-foreground">No skills assigned.</span>
        )}
        {assigned.map((a) => (
          <Badge key={a.id} variant="blue">
            {a.skill?.icon ? `${a.skill.icon} ` : ""}
            {a.skill?.name ?? a.skillId}
            <button
              className="ml-1.5 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => onUnassign(a.skillId)}
              aria-label="Unassign skill"
            >
              ×
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <select
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">Add a skill…</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon ? `${s.icon} ` : ""}
              {s.name}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!pick || busy} onClick={onAssign}>
          Assign
        </Button>
      </div>
    </Card>
  );
}
