"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "urql";
import { AGENTS_QUERY, AGENT_INSTRUCTIONS_QUERY } from "@/lib/graphql/queries";
import {
  UPSERT_AGENT_INSTRUCTION,
  DELETE_AGENT_INSTRUCTION,
  SEED_AGENT_INSTRUCTIONS,
} from "@/lib/graphql/mutations";
import { Button, Card, Badge, Input, FormField, FormDialog } from "@/components/ui";
import { useResourceDialog } from "@/hooks/useCrud";

// Epic #18: per-agent instruction bundles (AGENTS.md). AGENT_INSTRUCTIONS-gated. Pick an agent, edit
// its markdown instruction files, seed the role default bundle. Persisted config — delivery into a
// live agent process is a deferred runtime seam.

interface AgentLite {
  id: string;
  name: string;
  role: string;
}
interface Instruction {
  id: string;
  fileName: string;
  content: string;
  updatedAt: string;
}

export default function InstructionsPage() {
  const [{ data: agentsData }] = useQuery<{ agents: AgentLite[] }>({ query: AGENTS_QUERY });
  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const [agentId, setAgentId] = useState("");
  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const [{ data }, refetch] = useQuery<{ agentInstructions: Instruction[] }>({
    query: AGENT_INSTRUCTIONS_QUERY,
    variables: { agentId },
    pause: !agentId,
  });
  const [, upsert] = useMutation(UPSERT_AGENT_INSTRUCTION);
  const [, remove] = useMutation(DELETE_AGENT_INSTRUCTION);
  const [, seed] = useMutation(SEED_AGENT_INSTRUCTIONS);

  const files = data?.agentInstructions ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => refetch({ requestPolicy: "network-only" });

  const fileDlg = useResourceDialog({
    empty: { fileName: "" },
    submit: async (v) => {
      const name = v.fileName.trim();
      if (!name) return "File name is required";
      const res = await upsert({ agentId, fileName: name, content: `# ${name}\n\n` });
      if (res.error) return res.error.graphQLErrors?.[0]?.message ?? "Invalid file name";
      setSelected(name);
      return null;
    },
    onDone: refresh,
  });

  // Keep the editor in sync with the selected file.
  useEffect(() => {
    const active = files.find((f) => f.fileName === selected) ?? files[0] ?? null;
    if (active) {
      setSelected(active.fileName);
      setDraft(active.content);
    } else {
      setSelected(null);
      setDraft("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, agentId]);

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      await upsert({ agentId, fileName: selected, content: draft });
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function onSeed() {
    setBusy(true);
    try {
      await seed({ agentId });
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function onDelete(fileName: string) {
    setBusy(true);
    try {
      await remove({ agentId, fileName });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Agent instructions</h1>
          <p className="text-sm text-muted-foreground">
            Markdown instruction files (AGENTS.md) that configure how an agent behaves.
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

      <FormDialog
        open={fileDlg.open}
        onOpenChange={fileDlg.setOpen}
        title="Add instruction file"
        onSubmit={fileDlg.onSubmit}
        submitLabel="Add file"
        busy={fileDlg.busy}
        error={fileDlg.error}
        submitDisabled={!fileDlg.values.fileName.trim()}
      >
        <FormField label="File name">
          <Input
            className="font-mono"
            placeholder="NEW.md"
            value={fileDlg.values.fileName}
            onChange={(e) => fileDlg.set("fileName", e.target.value)}
          />
        </FormField>
      </FormDialog>

      {agentId && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr]">
          <Card className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Files</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={onSeed}>
                Seed defaults
              </Button>
            </div>
            {files.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No files. Seed the default bundle or add one.
              </p>
            )}
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setSelected(f.fileName);
                  setDraft(f.content);
                }}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                  selected === f.fileName ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                <span className="font-mono text-xs">{f.fileName}</span>
                {f.fileName === "AGENTS.md" && <Badge variant="blue">core</Badge>}
              </button>
            ))}
            <Button size="sm" variant="ghost" className="w-full" onClick={fileDlg.openCreate}>
              + Add file
            </Button>
          </Card>

          <Card className="space-y-2 p-3">
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-foreground">{selected}</span>
                  <span className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={save}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onDelete(selected)}
                    >
                      Delete
                    </Button>
                  </span>
                </div>
                <textarea
                  className="h-96 w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Select or seed a file to edit.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
