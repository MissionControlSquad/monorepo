"use client";

import { useState } from "react";
import { useQuery, useMutation, useClient } from "urql";
import { Users } from "lucide-react";
import { TEAMS_QUERY, PREVIEW_TEAM_INSTALL_QUERY } from "@/lib/graphql/queries";
import { INSTALL_TEAM } from "@/lib/graphql/mutations";
import { COLLISION_STRATEGIES } from "@agentcenter/utils";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { TeamDialog } from "@/components/dialogs/TeamDialog";
import { TeamMemberDialog } from "@/components/dialogs/TeamMemberDialog";

// Epic #10: teams catalog. SKILLS_TEAMS-gated (admin installs). A team is an installable bundle of
// agent roles; installing creates one agent per member with a collision strategy.

interface Member {
  id: string;
  name: string;
  role: string;
}
interface Team {
  id: string;
  name: string;
  key: string;
  icon: string | null;
  tagline: string | null;
  tags: string[];
  installCount: number;
  members: Member[];
}
interface PlanItem {
  member: string;
  action: string;
  agentName: string;
}

const STRATEGIES = COLLISION_STRATEGIES;

function actionVariant(action: string): "green" | "yellow" | "gray" | "red" {
  if (action === "create") return "green";
  if (action === "replace") return "yellow";
  if (action === "skip") return "gray";
  return "gray";
}

export default function TeamsPage() {
  const [{ data }, refetch] = useQuery<{ teams: Team[] }>({ query: TEAMS_QUERY });
  const [, installTeam] = useMutation(INSTALL_TEAM);
  const client = useClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, PlanItem[]>>({});
  const [teamOpen, setTeamOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberTeamId, setMemberTeamId] = useState<string | null>(null);
  const allTeams = data?.teams ?? [];
  const allTags = [...new Set(allTeams.flatMap((t) => t.tags))].sort();
  const teams = tagFilter ? allTeams.filter((t) => t.tags.includes(tagFilter)) : allTeams;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const openAddMember = (id: string) => {
    setMemberTeamId(id);
    setMemberOpen(true);
  };

  async function act(fn: () => Promise<unknown>, key: string) {
    setBusy(key);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto space-y-6 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Installable bundles of agent roles. Installing creates one agent per member.
          </p>
        </div>
        <Button onClick={() => setTeamOpen(true)}>New team</Button>
      </div>

      <TeamDialog open={teamOpen} onOpenChange={setTeamOpen} onSaved={refresh} />
      <TeamMemberDialog
        open={memberOpen}
        onOpenChange={setMemberOpen}
        teamId={memberTeamId}
        onSaved={refresh}
      />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={tagFilter === null} onClick={() => setTagFilter(null)} />
          {allTags.map((tag) => (
            <FilterChip key={tag} label={tag} active={tagFilter === tag} onClick={() => setTagFilter(tag)} />
          ))}
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No teams yet"
          description="Create a team, add roles, then install it to spin up agents."
        />
      ) : (
        teams.map((tm) => (
          <Card key={tm.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                {tm.icon && <span className="text-base">{tm.icon}</span>}
                <span className="font-medium text-foreground">{tm.name}</span>
                {tm.tagline && <span className="text-xs text-muted-foreground">— {tm.tagline}</span>}
                <Badge variant="gray">{tm.members.length} roles</Badge>
                <span className="text-xs text-muted-foreground">{tm.installCount} installs</span>
                {tm.tags.map((tag) => (
                  <Badge key={tag} variant="blue">{tag}</Badge>
                ))}
              </span>
              <span className="flex items-center gap-2">
                <select
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                  value={strategy[tm.id] ?? "rename"}
                  onChange={(e) => setStrategy((s) => ({ ...s, [tm.id]: e.target.value }))}
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>on collision: {s}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={tm.members.length === 0 || busy === tm.id}
                  onClick={() =>
                    act(async () => {
                      const res = await client
                        .query<{ previewTeamInstall: PlanItem[] }>(
                          PREVIEW_TEAM_INSTALL_QUERY,
                          { teamId: tm.id, collisionStrategy: strategy[tm.id] ?? "rename" },
                          { requestPolicy: "network-only" },
                        )
                        .toPromise();
                      setPreview((p) => ({ ...p, [tm.id]: res.data?.previewTeamInstall ?? [] }));
                      setResult((r) => ({ ...r, [tm.id]: "" }));
                    }, tm.id)
                  }
                >
                  Preview
                </Button>
                <Button
                  size="sm"
                  disabled={tm.members.length === 0 || busy === tm.id}
                  onClick={() =>
                    act(async () => {
                      const res = await installTeam({ teamId: tm.id, collisionStrategy: strategy[tm.id] ?? "rename" });
                      const ids = res.data?.installTeam?.createdAgentIds ?? [];
                      setResult((r) => ({ ...r, [tm.id]: `installed — ${ids.length} agent(s)` }));
                      setPreview((p) => ({ ...p, [tm.id]: [] }));
                    }, tm.id)
                  }
                >
                  Install
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openAddMember(tm.id)}>
                  Add role
                </Button>
              </span>
            </div>
            {preview[tm.id] && preview[tm.id].length > 0 && (
              <div className="space-y-1 rounded border border-dashed border-border p-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Install preview ({strategy[tm.id] ?? "rename"} on collision)
                </p>
                {preview[tm.id].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant={actionVariant(item.action)}>{item.action}</Badge>
                    <span className="text-foreground">{item.member}</span>
                    {item.agentName !== item.member && (
                      <span className="text-muted-foreground">→ {item.agentName}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {result[tm.id] && <p className="text-xs text-muted-foreground">{result[tm.id]}</p>}
            <div className="flex flex-wrap gap-2">
              {tm.members.map((m) => (
                <Badge key={m.id} variant="blue">{m.name} · {m.role}</Badge>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-transparent bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}
