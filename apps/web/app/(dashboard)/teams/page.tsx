"use client";

import { useState } from "react";
import { useQuery, useMutation, useClient } from "urql";
import { Users } from "lucide-react";
import { TEAMS_QUERY, PREVIEW_TEAM_INSTALL_QUERY } from "@/lib/graphql/queries";
import { CREATE_TEAM, ADD_TEAM_MEMBER, INSTALL_TEAM } from "@/lib/graphql/mutations";
import { COLLISION_STRATEGIES } from "@agentcenter/utils";
import { Button, Card, Badge, Input, FormField, FormDialog, EmptyState } from "@/components/ui";
import { useResourceDialog } from "@/hooks/useCrud";

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
  const [, createTeam] = useMutation(CREATE_TEAM);
  const [, addMember] = useMutation(ADD_TEAM_MEMBER);
  const [, installTeam] = useMutation(INSTALL_TEAM);
  const client = useClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Record<string, PlanItem[]>>({});
  const [memberTeamId, setMemberTeamId] = useState<string | null>(null);
  const allTeams = data?.teams ?? [];
  const allTags = [...new Set(allTeams.flatMap((t) => t.tags))].sort();
  const teams = tagFilter ? allTeams.filter((t) => t.tags.includes(tagFilter)) : allTeams;
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const teamDlg = useResourceDialog({
    empty: { name: "", icon: "", tagline: "", tags: "" },
    submit: async (v) => {
      if (!v.name.trim()) return "Team name is required";
      const r = await createTeam({
        name: v.name.trim(),
        icon: v.icon.trim() || null,
        tagline: v.tagline.trim() || null,
        tags: v.tags.split(",").map((s) => s.trim()).filter(Boolean),
      });
      return r.error?.message ?? null;
    },
    onDone: refresh,
  });

  const memberDlg = useResourceDialog({
    empty: { name: "", role: "" },
    submit: async (v) => {
      if (!memberTeamId) return "No team selected";
      if (!v.name.trim() || !v.role.trim()) return "Name and role are required";
      const r = await addMember({ teamId: memberTeamId, name: v.name.trim(), role: v.role.trim() });
      return r.error?.message ?? null;
    },
    onDone: refresh,
  });
  const openAddMember = (id: string) => {
    setMemberTeamId(id);
    memberDlg.openCreate();
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
        <Button onClick={teamDlg.openCreate}>New team</Button>
      </div>

      <FormDialog
        open={teamDlg.open}
        onOpenChange={teamDlg.setOpen}
        title="New team"
        onSubmit={teamDlg.onSubmit}
        submitLabel="Create team"
        busy={teamDlg.busy}
        error={teamDlg.error}
        submitDisabled={!teamDlg.values.name.trim()}
      >
        <div className="grid grid-cols-[4rem_1fr] gap-4">
          <FormField label="Icon">
            <Input placeholder="👥" value={teamDlg.values.icon} onChange={(e) => teamDlg.set("icon", e.target.value)} />
          </FormField>
          <FormField label="Name">
            <Input placeholder="e.g. Growth Squad" value={teamDlg.values.name} onChange={(e) => teamDlg.set("name", e.target.value)} />
          </FormField>
        </div>
        <FormField label="Tagline (optional)">
          <Input value={teamDlg.values.tagline} onChange={(e) => teamDlg.set("tagline", e.target.value)} />
        </FormField>
        <FormField label="Tags (comma-separated, optional)">
          <Input placeholder="growth, marketing" value={teamDlg.values.tags} onChange={(e) => teamDlg.set("tags", e.target.value)} />
        </FormField>
      </FormDialog>

      <FormDialog
        open={memberDlg.open}
        onOpenChange={memberDlg.setOpen}
        title="Add role"
        description="Add a role to the team; installing creates one agent for it."
        onSubmit={memberDlg.onSubmit}
        submitLabel="Add role"
        busy={memberDlg.busy}
        error={memberDlg.error}
        submitDisabled={!memberDlg.values.name.trim() || !memberDlg.values.role.trim()}
      >
        <FormField label="Member name">
          <Input value={memberDlg.values.name} onChange={(e) => memberDlg.set("name", e.target.value)} />
        </FormField>
        <FormField label="Role">
          <Input placeholder="e.g. Backend Developer" value={memberDlg.values.role} onChange={(e) => memberDlg.set("role", e.target.value)} />
        </FormField>
      </FormDialog>

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
