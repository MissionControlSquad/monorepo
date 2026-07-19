"use client";

import { useState } from "react";
import { useQuery, useMutation } from "urql";
import { SKILLS_QUERY } from "@/lib/graphql/queries";
import { CREATE_SKILL, FORK_SKILL, STAR_SKILL } from "@/lib/graphql/mutations";
import { Button, Card, Badge } from "@/components/ui";

// Epic #10: skills library. SKILLS_TEAMS-gated. Reusable markdown capability modules with versions,
// stars, forks; assign to agents from the agent view.

interface Skill {
  id: string;
  name: string;
  key: string;
  currentVersion: number;
  starCount: number;
  installCount: number;
  forkCount: number;
  trustLevel: string;
  forkedFromSkillId: string | null;
}

export default function SkillsPage() {
  const [{ data }, refetch] = useQuery<{ skills: Skill[] }>({ query: SKILLS_QUERY });
  const [, createSkill] = useMutation(CREATE_SKILL);
  const [, forkSkill] = useMutation(FORK_SKILL);
  const [, starSkill] = useMutation(STAR_SKILL);

  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    markdown: "# Skill\n\nDescribe what the agent should do.",
  });
  const [error, setError] = useState<string | null>(null);
  const skills = data?.skills ?? [];
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
  async function onCreate() {
    setError(null);
    if (!form.name.trim()) return setError("Name is required");
    const res = await createSkill({ name: form.name.trim(), markdown: form.markdown });
    if (res.error) return setError(res.error.graphQLErrors[0]?.message ?? "Failed to create");
    setForm({ name: "", markdown: "# Skill\n\nDescribe what the agent should do." });
    refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-lg font-semibold text-foreground">Skills</h1>
      <p className="-mt-4 text-sm text-muted-foreground">
        Reusable capability modules (markdown). Version on edit, fork, star, and assign to agents.
      </p>

      <Card className="space-y-3 p-4">
        <input
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm"
          placeholder="Skill name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <textarea
          className="h-28 w-full rounded border border-border bg-background px-3 py-1.5 font-mono text-xs"
          value={form.markdown}
          onChange={(e) => setForm((f) => ({ ...f, markdown: e.target.value }))}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={onCreate}>
            Create skill
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {skills.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No skills yet.</Card>
      )}
      {skills.map((s) => (
        <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{s.name}</span>
            <Badge variant="gray">v{s.currentVersion}</Badge>
            <Badge variant="blue">{s.trustLevel}</Badge>
            {s.forkedFromSkillId && <Badge variant="purple">fork</Badge>}
            <span className="text-xs text-muted-foreground">
              ★ {s.starCount} · {s.installCount} agents · {s.forkCount} forks
            </span>
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === s.id}
              onClick={() => act(() => starSkill({ id: s.id }), s.id)}
            >
              Star
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy === s.id}
              onClick={() => act(() => forkSkill({ id: s.id }), s.id)}
            >
              Fork
            </Button>
          </span>
        </Card>
      ))}
    </div>
  );
}
