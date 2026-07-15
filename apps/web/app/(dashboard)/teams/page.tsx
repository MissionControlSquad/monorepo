"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { TEAMS_QUERY } from "@/lib/graphql/queries";
import { CREATE_TEAM, ADD_TEAM_MEMBER, INSTALL_TEAM } from "@/lib/graphql/mutations";
import { COLLISION_STRATEGIES } from "@agentcenter/utils";
import { Button, Card, Badge } from "@/components/ui";

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

const STRATEGIES = COLLISION_STRATEGIES;

export default function TeamsPage() {
  const [{ data }, refetch] = useQuery<{ teams: Team[] }>({ query: TEAMS_QUERY });
  const [, createTeam] = useMutation(CREATE_TEAM);
  const [, addMember] = useMutation(ADD_TEAM_MEMBER);
  const [, installTeam] = useMutation(INSTALL_TEAM);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", icon: "", tagline: "", tags: "" });
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<Record<string, { name: string; role: string }>>({});
  const [strategy, setStrategy] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const allTeams = data?.teams ?? [];
  const allTags = [...new Set(allTeams.flatMap((t) => t.tags))].sort();
  const teams = tagFilter ? allTeams.filter((t) => t.tags.includes(tagFilter)) : allTeams;
  const refresh = () => refetch({ requestPolicy: "network-only" });

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
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Teams</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Installable bundles of agent roles. Installing creates one agent per member.
      </p>

      <Card className="space-y-2 p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[4rem_1fr]">
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-center text-sm"
            placeholder="👥"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
          />
          <input
            className="rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="New team name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Tagline (optional)"
          value={form.tagline}
          onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
        />
        <div className="flex gap-2">
          <input
            className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
            placeholder="Tags, comma-separated (optional)"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
          />
          <Button
            size="sm"
            disabled={!form.name.trim() || busy === "create"}
            onClick={() =>
              act(async () => {
                await createTeam({
                  name: form.name.trim(),
                  icon: form.icon.trim() || null,
                  tagline: form.tagline.trim() || null,
                  tags: form.tags
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                setForm({ name: "", icon: "", tagline: "", tags: "" });
              }, "create")
            }
          >
            Create team
          </Button>
        </div>
      </Card>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="All" active={tagFilter === null} onClick={() => setTagFilter(null)} />
          {allTags.map((tag) => (
            <FilterChip
              key={tag}
              label={tag}
              active={tagFilter === tag}
              onClick={() => setTagFilter(tag)}
            />
          ))}
        </div>
      )}

      {teams.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No teams yet.</Card>
      )}
      {teams.map((tm) => {
        const mf = memberForm[tm.id] ?? { name: "", role: "" };
        return (
          <Card key={tm.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                {tm.icon && <span className="text-base">{tm.icon}</span>}
                <span className="font-medium text-foreground">{tm.name}</span>
                {tm.tagline && (
                  <span className="text-xs text-muted-foreground">— {tm.tagline}</span>
                )}
                <Badge variant="gray">{tm.members.length} roles</Badge>
                <span className="text-xs text-muted-foreground">{tm.installCount} installs</span>
                {tm.tags.map((tag) => (
                  <Badge key={tag} variant="blue">
                    {tag}
                  </Badge>
                ))}
              </span>
              <span className="flex items-center gap-2">
                <select
                  className="rounded border border-border bg-background px-2 py-1 text-sm"
                  value={strategy[tm.id] ?? "rename"}
                  onChange={(e) => setStrategy((s) => ({ ...s, [tm.id]: e.target.value }))}
                >
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      on collision: {s}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={tm.members.length === 0 || busy === tm.id}
                  onClick={() =>
                    act(async () => {
                      const res = await installTeam({
                        teamId: tm.id,
                        collisionStrategy: strategy[tm.id] ?? "rename",
                      });
                      const ids = res.data?.installTeam?.createdAgentIds ?? [];
                      setResult((r) => ({ ...r, [tm.id]: `installed — ${ids.length} agent(s)` }));
                    }, tm.id)
                  }
                >
                  Install
                </Button>
              </span>
            </div>
            {result[tm.id] && <p className="text-xs text-muted-foreground">{result[tm.id]}</p>}
            <div className="flex flex-wrap gap-2">
              {tm.members.map((m) => (
                <Badge key={m.id} variant="blue">
                  {m.name} · {m.role}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="w-1/2 rounded border border-border bg-background px-2 py-1 text-sm"
                placeholder="Member name"
                value={mf.name}
                onChange={(e) =>
                  setMemberForm((s) => ({ ...s, [tm.id]: { ...mf, name: e.target.value } }))
                }
              />
              <input
                className="w-1/2 rounded border border-border bg-background px-2 py-1 text-sm"
                placeholder="Role"
                value={mf.role}
                onChange={(e) =>
                  setMemberForm((s) => ({ ...s, [tm.id]: { ...mf, role: e.target.value } }))
                }
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={!mf.name.trim() || !mf.role.trim() || busy === tm.id}
                onClick={() =>
                  act(async () => {
                    await addMember({ teamId: tm.id, name: mf.name.trim(), role: mf.role.trim() });
                    setMemberForm((s) => ({ ...s, [tm.id]: { name: "", role: "" } }));
                  }, tm.id)
                }
              >
                Add role
              </Button>
            </div>
          </Card>
        );
      })}
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
